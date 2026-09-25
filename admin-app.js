import {
  auth, db,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, increment, arrayUnion
} from "./firebase-config.js";

let adminUser = null;
let allPayments = [];
let allOrders = [];
let allProducts = [];
let allUsers = [];
let allPaymentNumbers = [];
let allGifts = [];
let allRequests = [];
let settings = { categories: [] };
let paymentFilter = 'pending';
let orderFilter = 'pending';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n) => '৳' + Number(n || 0).toLocaleString('bn-BD');

let toastTimer;
function toast(msg){
  let t = document.getElementById('gh-toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'gh-toast';
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111826;border:1px solid #1E2733;color:#EAF2F5;padding:10px 16px;border-radius:10px;font-size:12px;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.4);max-width:88%;text-align:center;';
    document.body.appendChild(t);
  }
  t.innerText = msg;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.style.opacity='0'; }, 2400);
}

async function adminLogin(){
  const email = document.getElementById('admin-email').value.trim();
  const pass = document.getElementById('admin-pass').value;
  const err = document.getElementById('login-error');
  err.innerText = '';
  if(!email || !pass){ err.innerText = 'সব তথ্য দিন'; return; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch(e){
    err.innerText = '❌ ' + (e.code === 'auth/invalid-credential' ? 'ভুল তথ্য' : e.message);
  }
}
window.adminLogin = adminLogin;

async function adminLogout(){ await signOut(auth); location.reload(); }
window.adminLogout = adminLogout;

onAuthStateChanged(auth, async (user) => {
  if(user){
    const snap = await getDoc(doc(db, 'users', user.uid));
    if(snap.exists() && snap.data().role === 'admin'){
      adminUser = user;
      document.getElementById('login-screen').classList.add('hidden-section');
      document.getElementById('admin-panel').classList.remove('hidden-section');
      startListeners();
      switchTab('dashboard');
    } else {
      await signOut(auth);
      document.getElementById('login-error').innerText = '❌ আপনি অ্যাডমিন নন';
    }
  } else {
    document.getElementById('login-screen').classList.remove('hidden-section');
    document.getElementById('admin-panel').classList.add('hidden-section');
  }
});

function switchTab(tab){
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.add('hidden-section'));
  document.getElementById('tab-' + tab).classList.remove('hidden-section');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('tab-active', b.dataset.tab === tab));
}
window.switchTab = switchTab;

function startListeners(){
  onSnapshot(query(collection(db, 'paymentRequests'), orderBy('createdAt', 'desc')), (snap) => {
    allPayments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPayments(); updateStats();
  }, (err) => console.error('payments:', err));

  onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snap) => {
    allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderOrders(); updateStats();
  }, (err) => console.error('orders:', err));

  onSnapshot(collection(db, 'products'), (snap) => {
    allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProducts(); updateStats();
  });

  onSnapshot(collection(db, 'users'), (snap) => {
    allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUsers(); updateStats();
  });

  onSnapshot(collection(db, 'paymentNumbers'), (snap) => {
    allPaymentNumbers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPaymentNumbers();
  });

  onSnapshot(collection(db, 'giftCodes'), (snap) => {
    allGifts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderGifts();
  });

  onSnapshot(doc(db, 'settings', 'general'), (snap) => {
    if(snap.exists()){ settings = snap.data(); }
    else { settings = { categories: [] }; }
    renderCategories();
  });

  onSnapshot(query(collection(db, 'customRequests'), orderBy('createdAt', 'desc')), (snap) => {
    allRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRequests();
  });
}

function updateStats(){
  const totalSales = allOrders.filter(o => o.status === 'approved').reduce((s,o) => s + (o.total||0), 0);
  document.getElementById('stat-sales').innerText = fmt(totalSales);
  document.getElementById('stat-orders').innerText = allOrders.length;
  document.getElementById('stat-users').innerText = allUsers.filter(u => u.role !== 'admin').length;
  document.getElementById('stat-products').innerText = allProducts.length;
  document.getElementById('stat-pending-payments').innerText = allPayments.filter(p => p.status === 'pending').length;
  document.getElementById('stat-pending-orders').innerText = allOrders.filter(o => o.status === 'pending').length;
  renderRevenueChart();
}

function renderRevenueChart(){
  const chart = document.getElementById('revenue-chart');
  const days = [];
  const now = new Date();
  for(let i = 6; i >= 0; i--){
    const d = new Date(now); d.setDate(d.getDate() - i);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000;
    const dayEnd = dayStart + 86400;
    const total = allOrders.filter(o => o.status === 'approved' && o.createdAt?.seconds >= dayStart && o.createdAt?.seconds < dayEnd)
      .reduce((s,o) => s + (o.total||0), 0);
    days.push({ label: d.toLocaleDateString('bn-BD', { weekday:'short' }), total });
  }
  const max = Math.max(...days.map(d => d.total), 1);
  chart.innerHTML = days.map(d => `
    <div class="flex-1 flex flex-col items-center gap-1">
      <div class="w-full rounded-t" style="height:${(d.total/max)*100}%;background:var(--accent);min-height:4px"></div>
      <span class="text-[9px]" style="color:var(--muted)">${d.label}</span>
    </div>`).join('');
}

function filterPayments(f, btn){
  paymentFilter = f;
  document.querySelectorAll('.pay-filter').forEach(b => b.classList.remove('tab-active'));
  if(btn) btn.classList.add('tab-active');
  renderPayments();
}
window.filterPayments = filterPayments;

function renderPayments(){
  const box = document.getElementById('payments-list');
  let list = allPayments;
  if(paymentFilter !== 'all') list = allPayments.filter(p => p.status === paymentFilter);
  if(list.length === 0){ box.innerHTML = `<p class="text-center py-6 text-xs" style="color:var(--muted)">কোনো পেমেন্ট নেই</p>`; return; }
  const statusMap = { pending:'⏳', approved:'✅', rejected:'❌' };
  const statusClass = { pending:'status-pending', approved:'status-approved', rejected:'status-rejected' };
  box.innerHTML = list.map(p => `
    <div class="card p-3">
      <div class="flex justify-between items-start mb-2">
        <div>
          <p class="font-bold text-sm">${fmt(p.amount)}</p>
          <p class="text-[11px]" style="color:var(--muted)">👤 ${esc(p.username)}</p>
          <p class="text-[11px]" style="color:var(--muted)">📧 ${esc(p.userEmail||'')}</p>
          <p class="text-[11px] mt-1">TrxID: <span style="color:var(--amber)">${esc(p.trxId)}</span></p>
          <p class="text-[11px]">From: <span style="color:var(--amber)">${esc(p.senderNumber)}</span></p>
        </div>
        <span class="text-lg ${statusClass[p.status]}">${statusMap[p.status]}</span>
      </div>
      ${p.status === 'pending' ? `
        <div class="flex gap-2">
          <button onclick="approvePayment('${p.id}')" class="flex-1 btn-accent py-2 rounded text-xs">✅ Approve</button>
          <button onclick="rejectPayment('${p.id}')" class="flex-1 chip py-2 rounded text-xs" style="color:var(--danger)">❌ Reject</button>
        </div>` : ''}
    </div>`).join('');
}

async function approvePayment(id){
  const p = allPayments.find(x => x.id === id);
  if(!p) return;
  if(!confirm(`${p.username}-এর ${fmt(p.amount)} অ্যাপ্রুভ করবেন?`)) return;
  try {
    await updateDoc(doc(db, 'users', p.userId), { balance: increment(p.amount) });
    await updateDoc(doc(db, 'paymentRequests', id), { status: 'approved', approvedAt: serverTimestamp(), approvedBy: adminUser.uid });
    toast('✅ Approved');
  } catch(e){ toast('❌ ' + e.message); }
}
window.approvePayment = approvePayment;

async function rejectPayment(id){
  if(!confirm('রিজেক্ট করবেন?')) return;
  await updateDoc(doc(db, 'paymentRequests', id), { status: 'rejected', rejectedAt: serverTimestamp() });
  toast('❌ Rejected');
}
window.rejectPayment = rejectPayment;

function filterOrders(f, btn){
  orderFilter = f;
  document.querySelectorAll('.ord-filter').forEach(b => b.classList.remove('tab-active'));
  if(btn) btn.classList.add('tab-active');
  renderOrders();
}
window.filterOrders = filterOrders;

function renderOrders(){
  const box = document.getElementById('orders-list');
  let list = allOrders;
  if(orderFilter !== 'all') list = allOrders.filter(o => o.status === orderFilter);
  if(list.length === 0){ box.innerHTML = `<p class="text-center py-6 text-xs" style="color:var(--muted)">কোনো অর্ডার নেই</p>`; return; }
  const statusMap = { pending:'⏳', approved:'✅', rejected:'❌' };
  const statusClass = { pending:'status-pending', approved:'status-approved', rejected:'status-rejected' };
  box.innerHTML = list.map(o => `
    <div class="card p-3">
      <div class="flex justify-between items-start mb-2">
        <div class="flex-1">
          <p class="font-bold text-sm">${fmt(o.total)}</p>
          <p class="text-[11px]" style="color:var(--muted)">👤 ${esc(o.username)} (${esc(o.userEmail||'')})</p>
          <div class="text-[11px] mt-1">${(o.items||[]).map(i => `${esc(i.title)} × ${i.qty||1}`).join('<br>')}</div>
        </div>
        <span class="text-lg ${statusClass[o.status]}">${statusMap[o.status]}</span>
      </div>
      ${o.status === 'pending' ? `
        <div class="flex gap-2">
          <button onclick="approveOrder('${o.id}')" class="flex-1 btn-accent py-2 rounded text-xs">✅ Approve</button>
          <button onclick="rejectOrder('${o.id}')" class="flex-1 chip py-2 rounded text-xs" style="color:var(--danger)">❌ Reject</button>
        </div>` : ''}
    </div>`).join('');
}

async function approveOrder(id){
  const o = allOrders.find(x => x.id === id);
  if(!o) return;
  if(!confirm(`${fmt(o.total)} অ্যাপ্রুভ করবেন? ব্যালেন্স কাটা হবে।`)) return;
  try {
    const userSnap = await getDoc(doc(db, 'users', o.userId));
    if(!userSnap.exists()){ toast('❌ ইউজার নেই'); return; }
    const bal = userSnap.data().balance || 0;
    if(bal < o.total){ toast('❌ পর্যাপ্ত ব্যালেন্স নেই'); return; }
    await updateDoc(doc(db, 'users', o.userId), { balance: increment(-o.total) });
    await updateDoc(doc(db, 'orders', id), { status:'approved', approvedAt: serverTimestamp() });
    toast('✅ Approved');
  } catch(e){ toast('❌ ' + e.message); }
}
window.approveOrder = approveOrder;

async function rejectOrder(id){
  if(!confirm('রিজেক্ট করবেন?')) return;
  await updateDoc(doc(db, 'orders', id), { status: 'rejected', rejectedAt: serverTimestamp() });
  toast('❌ Rejected');
}
window.rejectOrder = rejectOrder;

async function addProduct(){
  const title = document.getElementById('ap-title').value.trim();
  const price = parseInt(document.getElementById('ap-price').value);
  const oldPrice = parseInt(document.getElementById('ap-old-price').value) || 0;
  const category = document.getElementById('ap-category').value.trim();
  const image = document.getElementById('ap-image').value.trim();
  const badge = document.getElementById('ap-badge').value;
  const desc = document.getElementById('ap-desc').value.trim();
  if(!title || !price){ toast('নাম ও দাম দিন'); return; }
  await addDoc(collection(db, 'products'), { title, price, oldPrice, category, image, badge, desc, createdAt: serverTimestamp() });
  ['ap-title','ap-price','ap-old-price','ap-category','ap-image','ap-desc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ap-badge').value = '';
  toast('✅ প্রোডাক্ট যোগ হয়েছে');
}
window.addProduct = addProduct;

function renderProducts(){
  const box = document.getElementById('products-list');
  if(!allProducts.length){ box.innerHTML = `<p class="text-center py-6 text-xs" style="color:var(--muted)">কোনো প্রোডাক্ট নেই</p>`; return; }
  box.innerHTML = allProducts.map(p => `
    <div class="card p-3 flex items-center gap-3">
      <img src="${esc(p.image||'')}" class="w-14 h-14 rounded-lg object-cover" style="background:var(--panel-2)" onerror="this.style.opacity=0">
      <div class="flex-1 min-w-0">
        <p class="font-bold text-xs truncate">${esc(p.title)}</p>
        <p class="text-[11px]" style="color:var(--accent)">${fmt(p.price)} ${p.badge?`<span class="chip px-1.5 py-0.5 rounded text-[9px]" style="color:var(--amber)">${esc(p.badge)}</span>`:''}</p>
      </div>
      <button onclick="deleteProduct('${p.id}')" class="chip px-2 py-1.5 rounded text-xs" style="color:var(--danger)">মুছুন</button>
    </div>`).join('');
}

async function deleteProduct(id){
  if(!confirm('মুছবেন?')) return;
  await deleteDoc(doc(db, 'products', id));
  toast('✅ মুছে ফেলা হয়েছে');
}
window.deleteProduct = deleteProduct;

function renderUsers(){
  const box = document.getElementById('users-list');
  if(!allUsers.length){ box.innerHTML = `<p class="text-center py-6 text-xs" style="color:var(--muted)">কোনো ইউজার নেই</p>`; return; }
  box.innerHTML = allUsers.map(u => `
    <div class="card p-3 flex justify-between items-center">
      <div>
        <p class="font-bold text-xs">${esc(u.username)} ${u.role==='admin'?'<span style="color:var(--amber)">[ADMIN]</span>':''}</p>
        <p class="text-[10px]" style="color:var(--muted)">${esc(u.email||'')} · ${esc(u.phone||'')}</p>
      </div>
      <div class="text-right">
        <p class="text-sm font-bold" style="color:var(--accent)">${fmt(u.balance||0)}</p>
        <button onclick="adjustBalance('${u.id}', '${esc(u.username)}')" class="text-[10px] chip px-2 py-1 rounded mt-1">Adjust</button>
      </div>
    </div>`).join('');
}

async function adjustBalance(uid, uname){
  const amtStr = prompt(`${uname}-এর ব্যালেন্স কত যোগ/বিয়োগ করবেন?`);
  if(!amtStr) return;
  const amt = parseInt(amtStr);
  if(isNaN(amt)){ toast('ভুল সংখ্যা'); return; }
  await updateDoc(doc(db, 'users', uid), { balance: increment(amt) });
  toast('✅ আপডেট হয়েছে');
}
window.adjustBalance = adjustBalance;

async function addPaymentNumber(){
  const type = document.getElementById('pn-type').value;
  const number = document.getElementById('pn-number').value.trim();
  const name = document.getElementById('pn-name').value.trim();
  const personal = document.getElementById('pn-personal').checked;
  if(!number){ toast('নাম্বার দিন'); return; }
  await addDoc(collection(db, 'paymentNumbers'), { type, number, name, personal, createdAt: serverTimestamp() });
  document.getElementById('pn-number').value = '';
  document.getElementById('pn-name').value = '';
  document.getElementById('pn-personal').checked = false;
  toast('✅ নাম্বার যোগ হয়েছে');
}
window.addPaymentNumber = addPaymentNumber;

function renderPaymentNumbers(){
  const box = document.getElementById('payment-numbers-list');
  if(!allPaymentNumbers.length){ box.innerHTML = `<p class="text-center py-6 text-xs" style="color:var(--muted)">কোনো নাম্বার নেই</p>`; return; }
  box.innerHTML = allPaymentNumbers.map(n => `
    <div class="card p-3 flex justify-between items-center">
      <div>
        <p class="font-bold text-xs" style="color:var(--accent)">${esc(n.type)}</p>
        <p class="text-sm">${esc(n.number)}</p>
        <p class="text-[10px]" style="color:var(--muted)">${esc(n.name||'')} ${n.personal?'(Personal)':'(Agent)'}</p>
      </div>
      <button onclick="deletePaymentNumber('${n.id}')" class="chip px-2 py-1.5 rounded text-xs" style="color:var(--danger)">মুছুন</button>
    </div>`).join('');
}

async function deletePaymentNumber(id){
  if(!confirm('মুছবেন?')) return;
  await deleteDoc(doc(db, 'paymentNumbers', id));
  toast('✅ মুছে ফেলা হয়েছে');
}
window.deletePaymentNumber = deletePaymentNumber;

async function addGiftCode(){
  const code = document.getElementById('gc-code').value.trim().toUpperCase();
  const amount = parseInt(document.getElementById('gc-amount').value);
  const maxUses = parseInt(document.getElementById('gc-max').value) || 1;
  if(!code || !amount){ toast('কোড ও amount দিন'); return; }
  await addDoc(collection(db, 'giftCodes'), { code, amount, maxUses, usedBy: [], createdAt: serverTimestamp() });
  document.getElementById('gc-code').value = '';
  document.getElementById('gc-amount').value = '';
  toast('✅ গিফট কোড তৈরি');
}
window.addGiftCode = addGiftCode;

function renderGifts(){
  const box = document.getElementById('gifts-list');
  if(!allGifts.length){ box.innerHTML = `<p class="text-center py-6 text-xs" style="color:var(--muted)">কোনো কোড নেই</p>`; return; }
  box.innerHTML = allGifts.map(g => `
    <div class="card p-3 flex justify-between items-center">
      <div>
        <p class="font-bold text-xs" style="color:var(--accent)">${esc(g.code)}</p>
        <p class="text-[11px]">${fmt(g.amount)} · Used: ${(g.usedBy||[]).length}/${g.maxUses||1}</p>
      </div>
      <button onclick="deleteGift('${g.id}')" class="chip px-2 py-1.5 rounded text-xs" style="color:var(--danger)">মুছুন</button>
    </div>`).join('');
}

async function deleteGift(id){
  if(!confirm('মুছবেন?')) return;
  await deleteDoc(doc(db, 'giftCodes', id));
  toast('✅ মুছে ফেলা হয়েছে');
}
window.deleteGift = deleteGift;

async function addCategory(){
  const cat = document.getElementById('new-category').value.trim();
  if(!cat){ toast('ক্যাটাগরি দিন'); return; }
  const cats = settings.categories || [];
  if(cats.includes(cat)){ toast('আগেই আছে'); return; }
  await setDoc(doc(db, 'settings', 'general'), { ...settings, categories: [...cats, cat] }, { merge: true });
  document.getElementById('new-category').value = '';
  toast('✅ যোগ হয়েছে');
}
window.addCategory = addCategory;

function renderCategories(){
  const box = document.getElementById('categories-list');
  const cats = settings.categories || [];
  box.innerHTML = cats.map(c => `
    <span class="chip px-3 py-1.5 rounded-full text-xs flex items-center gap-2">
      ${esc(c)}
      <button onclick="removeCategory('${esc(c)}')" style="color:var(--danger)">✕</button>
    </span>`).join('');
}

async function removeCategory(cat){
  const cats = (settings.categories || []).filter(c => c !== cat);
  await setDoc(doc(db, 'settings', 'general'), { ...settings, categories: cats }, { merge: true });
  toast('✅ মুছে ফেলা হয়েছে');
}
window.removeCategory = removeCategory;

function renderRequests(){
  const box = document.getElementById('requests-list');
  if(!allRequests.length){ box.innerHTML = `<p class="text-center py-6 text-xs" style="color:var(--muted)">কোনো রিকোয়েস্ট নেই</p>`; return; }
  box.innerHTML = allRequests.map(r => `
    <div class="card p-3">
      <p class="font-bold text-xs" style="color:var(--accent)">${esc(r.title)}</p>
      <p class="text-[10px]" style="color:var(--muted)">👤 ${esc(r.username)}</p>
      ${r.details ? `<p class="text-[11px] mt-1">${esc(r.details)}</p>` : ''}
    </div>`).join('');
}