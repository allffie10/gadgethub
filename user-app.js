import {
  auth, db,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, sendPasswordResetEmail,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, increment, arrayUnion
} from "./firebase-config.js";

let currentUser = null;
let userProfile = null;
let products = [];
let paymentNumbers = [];
let categories = [];
let settings = {};
let cart = [];
let wishlist = [];
let myOrders = [];
let myPayments = [];
let currentProduct = {};
let authMode = 'login';
let selectedCategory = '';
let lastSpinAt = 0;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n) => '৳' + Number(n || 0).toLocaleString('bn-BD');

let toastTimer;
function toast(msg){
  let t = document.getElementById('gh-toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'gh-toast';
    t.style.cssText = 'position:fixed;left:50%;bottom:100px;transform:translateX(-50%);background:#0F1A18;border:1px solid #00FF88;color:#E8F5F1;padding:11px 18px;border-radius:10px;font-size:12px;z-index:60;box-shadow:0 0 20px rgba(0,255,136,0.3);max-width:88%;text-align:center;transition:opacity .2s;';
    document.body.appendChild(t);
  }
  t.innerText = msg;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.style.opacity='0'; }, 2400);
}
window.toast = toast;

function go(section){
  if(section === 'login-redirect'){ openAuth('login'); return; }
  document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden-section'));
  const target = document.getElementById('section-' + section);
  if(target) target.classList.remove('hidden-section');
  document.getElementById('nav-home').classList.toggle('nav-active', section === 'home');
  if(section === 'profile') renderProfile();
  if(section === 'wishlist') renderWishlist();
  if(section === 'leaderboard') renderLeaderboard();
  if(section === 'add-balance') renderPaymentNumbers();
  if(section === 'referral') renderReferral();
  window.scrollTo(0,0);
}
window.go = go;

function openAuth(mode){
  authMode = mode;
  document.getElementById('auth-modal').classList.remove('hidden');
  document.getElementById('auth-modal').classList.add('flex');
  setAuthMode(mode);
  ['auth-username','auth-phone','auth-email','auth-pass'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
}
window.openAuth = openAuth;

function closeAuth(){
  document.getElementById('auth-modal').classList.add('hidden');
  document.getElementById('auth-modal').classList.remove('flex');
}
window.closeAuth = closeAuth;

function setAuthMode(m){
  authMode = m;
  const showSignup = m === 'signup';
  document.getElementById('auth-username').classList.toggle('hidden', !showSignup);
  document.getElementById('auth-phone').classList.toggle('hidden', !showSignup);
  document.getElementById('tab-login').style.background = !showSignup ? 'var(--accent)' : 'transparent';
  document.getElementById('tab-login').style.color = !showSignup ? '#062A1A' : 'var(--text)';
  document.getElementById('tab-signup').style.background = showSignup ? 'var(--accent)' : 'transparent';
  document.getElementById('tab-signup').style.color = showSignup ? '#062A1A' : 'var(--text)';
}
window.setAuthMode = setAuthMode;

async function handleAuthSubmit(){
  const username = document.getElementById('auth-username').value.trim();
  const phone = document.getElementById('auth-phone').value.trim();
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-pass').value;

  if(!email || !pass){ toast('Email and password required'); return; }
  if(pass.length < 6){ toast('Password must be 6+ characters'); return; }

  try {
    if(authMode === 'signup'){
      if(!username || !phone){ toast('All fields required'); return; }
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await setDoc(doc(db, 'users', cred.user.uid), {
        username, email, phone, balance: 0, role: 'user', createdAt: serverTimestamp()
      });
      toast('✅ Account created');
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      toast('✅ Login successful');
    }
    closeAuth();
  } catch(err){
    const msg = {
      'auth/email-already-in-use': 'Email already registered',
      'auth/invalid-email': 'Invalid email',
      'auth/weak-password': 'Weak password',
      'auth/user-not-found': 'Account not found',
      'auth/wrong-password': 'Wrong password',
      'auth/invalid-credential': 'Invalid credentials'
    }[err.code] || err.message;
    toast('❌ ' + msg);
  }
}
window.handleAuthSubmit = handleAuthSubmit;

async function handleForgotPassword(){
  const email = document.getElementById('auth-email').value.trim();
  if(!email){ toast('Enter email first'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    toast('✅ Reset link sent');
  } catch(err){ toast('❌ ' + err.message); }
}
window.handleForgotPassword = handleForgotPassword;

async function doLogout(){
  await signOut(auth);
  toast('Logged out');
  go('home');
}
window.doLogout = doLogout;

onAuthStateChanged(auth, async (user) => {
  if(user){
    currentUser = user;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if(snap.exists()){
      userProfile = snap.data();
      onSnapshot(doc(db, 'users', user.uid), (s) => {
        if(s.exists()){ userProfile = s.data(); updateBalanceUI(); }
      });
    }
    document.getElementById('nav-auth-btn').innerText = 'PROFILE';
    document.getElementById('nav-auth-btn').onclick = () => go('profile');
    updateBalanceUI();
    loadCart(); loadWishlist(); loadMyOrders(); loadMyPayments();
  } else {
    currentUser = null; userProfile = null;
    document.getElementById('nav-auth-btn').innerText = 'LOGIN';
    document.getElementById('nav-auth-btn').onclick = () => openAuth('login');
    updateBalanceUI();
    cart = []; wishlist = []; myOrders = []; myPayments = [];
    renderCart(); renderWishlist(); renderMyOrders(); renderMyPayments();
  }
});

function updateBalanceUI(){
  const bal = userProfile?.balance || 0;
  document.getElementById('nav-balance').innerText = bal;
  document.getElementById('profile-balance').innerText = bal;
}

onSnapshot(collection(db, 'products'), (snap) => {
  products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  products.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
  renderProducts();
});

onSnapshot(collection(db, 'paymentNumbers'), (snap) => {
  paymentNumbers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderPaymentNumbers();
});

onSnapshot(doc(db, 'settings', 'general'), (snap) => {
  if(snap.exists()){ settings = snap.data(); categories = settings.categories || []; renderCategories(); }
});

function renderCategories(){
  const bar = document.getElementById('categories-bar');
  if(!categories.length){ bar.innerHTML = ''; return; }
  bar.innerHTML = `<button onclick="filterByCategory('')" class="chip px-3 py-1.5 rounded-full text-xs whitespace-nowrap" style="color:var(--accent);border-color:var(--accent)">সব</button>` +
    categories.map(c => `<button onclick="filterByCategory('${esc(c)}')" class="chip px-3 py-1.5 rounded-full text-xs whitespace-nowrap">${esc(c)}</button>`).join('');
}

function filterByCategory(cat){ selectedCategory = cat; renderProducts(); }
window.filterByCategory = filterByCategory;

function renderProducts(){
  const grid = document.getElementById('product-grid');
  const q = (document.getElementById('search-input').value || '').toLowerCase();
  let filtered = products.filter(p => (p.title||'').toLowerCase().includes(q));
  if(selectedCategory) filtered = filtered.filter(p => p.category === selectedCategory);
  document.getElementById('product-count').innerText = filtered.length + ' টি';
  if(filtered.length === 0){
    grid.innerHTML = `<div class="col-span-2 text-center py-10 text-xs" style="color:var(--muted)">কোনো প্রোডাক্ট নেই</div>`;
    return;
  }
  grid.innerHTML = filtered.map(p => productCard(p)).join('');
}

function productCard(p){
  const badgeColor = p.badge === 'HOT' ? '#FF5C6A' : p.badge === 'NEW' ? '#3B82F6' : '#00FF88';
  const badgeHtml = p.badge ? `<span class="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded text-white z-10" style="background:${badgeColor}">${esc(p.badge)}</span>` : '';
  const oldPriceHtml = p.oldPrice ? `<span class="text-[11px] line-through" style="color:var(--muted)">৳${p.oldPrice}</span>` : '';
  const isWished = wishlist.includes(p.id);
  const imgUrl = p.image || '';
  return `
    <div class="card p-3 relative flex flex-col justify-between fade-in">
      ${badgeHtml}
      <button onclick='event.stopPropagation();toggleWishlist(${JSON.stringify(p.id)})' class="absolute top-2 right-2 text-base z-10 ${isWished?'heart-active':''}" style="color:var(--muted)">${isWished?'❤️':'🤍'}</button>
      <div>
        <div class="h-32 rounded-lg overflow-hidden mb-2 relative" style="background:var(--panel-2)">
          <img src="${esc(imgUrl)}" class="w-full h-full object-cover" loading="lazy"
            onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;color:#6B8681;font-size:40px\\'>📦</div>'">
        </div>
        <h3 class="font-bold text-xs mb-1 leading-snug">${esc(p.title)}</h3>
        <div class="flex items-center gap-2 mb-3">
          ${oldPriceHtml}
          <span class="font-extrabold text-sm" style="color:var(--accent)">৳${p.price}</span>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-1.5">
        <button onclick='addToCart(${JSON.stringify(p.id)})' class="chip py-1.5 rounded text-[11px] font-bold" style="color:var(--accent)">+কার্ট</button>
        <button onclick='openProductDetail(${JSON.stringify(p.id)})' class="btn-accent py-1.5 rounded text-[11px]">কিনুন</button>
      </div>
    </div>`;
}

function openProductDetail(id){
  const p = products.find(x => x.id === id);
  if(!p) return;
  currentProduct = p;
  document.getElementById('detail-img').src = p.image || '';
  document.getElementById('detail-title').innerText = p.title;
  document.getElementById('detail-price').innerText = '৳' + p.price;
  document.getElementById('detail-old-price').innerText = p.oldPrice ? '৳' + p.oldPrice : '';
  document.getElementById('detail-desc').innerText = p.desc || '';
  document.getElementById('detail-heart').innerText = wishlist.includes(p.id) ? '❤️' : '🤍';
  go('product-detail');
}
window.openProductDetail = openProductDetail;

function loadCart(){
  if(!currentUser) return;
  onSnapshot(collection(db, 'carts', currentUser.uid, 'items'), (snap) => {
    cart = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCart();
  });
}

async function addToCart(productId){
  if(!currentUser){ toast('Login to add to cart'); openAuth('login'); return; }
  const p = products.find(x => x.id === productId);
  if(!p) return;
  await setDoc(doc(db, 'carts', currentUser.uid, 'items', productId), {
    productId, title: p.title, price: p.price, image: p.image || '', qty: 1
  });
  toast('✅ Added to cart');
}
window.addToCart = addToCart;

function addCurrentToCart(){ addToCart(currentProduct.id); go('home'); }
window.addCurrentToCart = addCurrentToCart;

async function removeFromCart(itemId){
  if(!currentUser) return;
  await deleteDoc(doc(db, 'carts', currentUser.uid, 'items', itemId));
}
window.removeFromCart = removeFromCart;

function renderCart(){
  document.getElementById('cart-badge').innerText = cart.length;
  const box = document.getElementById('cart-items-container');
  if(cart.length === 0){
    box.innerHTML = `<p class="text-center mt-10" style="color:var(--muted)">Cart is empty</p>`;
    document.getElementById('cart-total-price').innerText = '৳0';
    return;
  }
  let total = 0;
  box.innerHTML = cart.map(item => {
    total += item.price * (item.qty||1);
    return `<div class="flex justify-between items-center chip p-2.5 rounded">
      <div><p class="font-bold">${esc(item.title)}</p><p style="color:var(--accent)">৳${item.price}</p></div>
      <button onclick="removeFromCart('${item.id}')" style="color:var(--danger)">✕</button>
    </div>`;
  }).join('');
  document.getElementById('cart-total-price').innerText = fmt(total);
}

function openCart(){ document.getElementById('cart-modal').classList.remove('hidden'); document.getElementById('cart-modal').classList.add('flex'); }
function closeCart(){ document.getElementById('cart-modal').classList.add('hidden'); document.getElementById('cart-modal').classList.remove('flex'); }
window.openCart = openCart;
window.closeCart = closeCart;

async function checkoutCart(){
  if(!currentUser){ toast('Login required'); openAuth('login'); return; }
  if(cart.length === 0) return;
  const total = cart.reduce((s,i)=>s+i.price*(i.qty||1), 0);
  const bal = userProfile?.balance || 0;
  if(bal < total){ toast('❌ Insufficient balance'); closeCart(); go('add-balance'); return; }
  await addDoc(collection(db, 'orders'), {
    userId: currentUser.uid, username: userProfile.username, userEmail: currentUser.email,
    items: cart.map(i => ({ productId: i.productId, title: i.title, price: i.price, qty: i.qty||1 })),
    total, status: 'pending', createdAt: serverTimestamp()
  });
  for(const item of cart){
    await deleteDoc(doc(db, 'carts', currentUser.uid, 'items', item.id));
  }
  closeCart();
  toast('✅ Order placed!');
  go('my-orders');
}
window.checkoutCart = checkoutCart;

async function executeBuy(){
  if(!currentUser){ toast('Login required'); openAuth('login'); return; }
  const bal = userProfile?.balance || 0;
  if(bal < currentProduct.price){ toast('❌ Insufficient balance'); go('add-balance'); return; }
  await addDoc(collection(db, 'orders'), {
    userId: currentUser.uid, username: userProfile.username, userEmail: currentUser.email,
    items: [{ productId: currentProduct.id, title: currentProduct.title, price: currentProduct.price, qty: 1 }],
    total: currentProduct.price, status: 'pending', createdAt: serverTimestamp()
  });
  toast('✅ Order placed!');
  go('my-orders');
}
window.executeBuy = executeBuy;

function loadWishlist(){
  if(!currentUser) return;
  onSnapshot(collection(db, 'wishlists', currentUser.uid, 'items'), (snap) => {
    wishlist = snap.docs.map(d => d.id);
    renderProducts(); renderWishlist();
  });
}

async function toggleWishlist(productId){
  if(!currentUser){ toast('Login required'); openAuth('login'); return; }
  const ref = doc(db, 'wishlists', currentUser.uid, 'items', productId);
  const snap = await getDoc(ref);
  if(snap.exists()){ await deleteDoc(ref); toast('Removed from wishlist'); }
  else { await setDoc(ref, { productId, addedAt: serverTimestamp() }); toast('Added to wishlist'); }
}
window.toggleWishlist = toggleWishlist;

function toggleWishlistCurrent(){ toggleWishlist(currentProduct.id); }
window.toggleWishlistCurrent = toggleWishlistCurrent;

function renderWishlist(){
  const grid = document.getElementById('wishlist-grid');
  const items = products.filter(p => wishlist.includes(p.id));
  grid.innerHTML = items.length ? items.map(p => productCard(p)).join('') :
    `<div class="col-span-2 text-center py-10 text-xs" style="color:var(--muted)">Wishlist empty</div>`;
}

function renderPaymentNumbers(){
  const box = document.getElementById('payment-numbers-list');
  if(!paymentNumbers.length){
    box.innerHTML = `<p class="text-center text-xs py-4" style="color:var(--muted)">No payment numbers added yet</p>`;
    return;
  }
  const colors = { bKash:'#E2136E', Nagad:'#F7941D', Rocket:'#8C52FF' };
  box.innerHTML = paymentNumbers.map(n => `
    <div class="chip p-3 rounded-lg flex justify-between items-center">
      <div>
        <p class="font-bold text-xs" style="color:${colors[n.type] || 'var(--accent)'}">${esc(n.type)} ${n.personal ? '(Personal)' : '(Agent)'}</p>
        <p class="text-sm font-bold">${esc(n.number)}</p>
        <p class="text-[10px]" style="color:var(--muted)">${esc(n.name || '')}</p>
      </div>
      <button onclick="copyText('${esc(n.number)}')" class="chip px-2.5 py-1.5 rounded text-[10px]">COPY</button>
    </div>`).join('');
}

function copyText(t){
  navigator.clipboard?.writeText(t).then(()=>toast('Copied')).catch(()=>toast('Copy failed'));
}
window.copyText = copyText;

async function submitPaymentRequest(){
  if(!currentUser){ toast('Login required'); openAuth('login'); return; }
  const amount = parseInt(document.getElementById('topup-amount').value);
  const trxId = document.getElementById('trx-id').value.trim();
  const senderNumber = document.getElementById('sender-number').value.trim();
  if(!amount || amount <= 0){ toast('Enter valid amount'); return; }
  if(!trxId || trxId.length < 4){ toast('Enter valid TrxID'); return; }
  if(!senderNumber || senderNumber.length < 11){ toast('Enter valid sender number'); return; }
  await addDoc(collection(db, 'paymentRequests'), {
    userId: currentUser.uid, username: userProfile.username, userEmail: currentUser.email,
    amount, trxId, senderNumber, status: 'pending', createdAt: serverTimestamp()
  });
  document.getElementById('topup-amount').value = '';
  document.getElementById('trx-id').value = '';
  document.getElementById('sender-number').value = '';
  toast('✅ Request sent');
  go('my-payments');
}
window.submitPaymentRequest = submitPaymentRequest;

function loadMyPayments(){
  if(!currentUser) return;
  const q = query(collection(db, 'paymentRequests'), where('userId', '==', currentUser.uid));
  onSnapshot(q, (snap) => {
    myPayments = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    renderMyPayments();
  });
}

function renderMyPayments(){
  const box = document.getElementById('my-payments-list');
  if(!box) return;
  if(myPayments.length === 0){ box.innerHTML = `<p class="text-center py-6" style="color:var(--muted)">No payment requests</p>`; return; }
  const statusMap = { pending:'⏳ PENDING', approved:'✅ APPROVED', rejected:'❌ REJECTED' };
  const statusClass = { pending:'status-pending', approved:'status-approved', rejected:'status-rejected' };
  box.innerHTML = myPayments.map(p => `
    <div class="chip p-3 rounded">
      <div class="flex justify-between items-center mb-1">
        <span class="font-bold">${fmt(p.amount)}</span>
        <span class="text-[10px] ${statusClass[p.status]}">${statusMap[p.status]}</span>
      </div>
      <p class="text-[10px]" style="color:var(--muted)">TrxID: ${esc(p.trxId)} · From: ${esc(p.senderNumber)}</p>
    </div>`).join('');
}

function loadMyOrders(){
  if(!currentUser) return;
  const q = query(collection(db, 'orders'), where('userId', '==', currentUser.uid));
  onSnapshot(q, (snap) => {
    myOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    renderMyOrders();
  });
}

function renderMyOrders(){
  const box = document.getElementById('orders-list');
  if(!box) return;
  if(myOrders.length === 0){ box.innerHTML = `<p class="text-center py-6" style="color:var(--muted)">No orders</p>`; return; }
  const statusMap = { pending:'⏳ PENDING', approved:'✅ COMPLETED', rejected:'❌ CANCELLED' };
  const statusClass = { pending:'status-pending', approved:'status-approved', rejected:'status-rejected' };
  box.innerHTML = myOrders.map(o => `
    <div class="chip p-3 rounded">
      <div class="flex justify-between items-center mb-1">
        <span class="font-bold" style="color:var(--accent)">${fmt(o.total)}</span>
        <span class="text-[10px] ${statusClass[o.status]}">${statusMap[o.status]}</span>
      </div>
      <p class="text-[10px] mb-1">${(o.items||[]).map(i => esc(i.title) + ' × ' + (i.qty||1)).join(', ')}</p>
      <p class="text-[10px]" style="color:var(--muted)">${o.createdAt ? new Date(o.createdAt.seconds*1000).toLocaleDateString('bn-BD') : ''}</p>
    </div>`).join('');
}

function renderProfile(){
  document.getElementById('profile-name').innerText = userProfile?.username?.toUpperCase() || 'GUEST';
  document.getElementById('profile-email').innerText = currentUser?.email || '';
  document.getElementById('profile-phone').innerText = userProfile?.phone ? '📱 ' + userProfile.phone : '';
  document.getElementById('profile-balance').innerText = userProfile?.balance || 0;
}

function renderLeaderboard(){
  const q = query(collection(db, 'orders'), where('status', '==', 'approved'));
  onSnapshot(q, (snap) => {
    const orders = snap.docs.map(d => d.data());
    const totals = {};
    orders.forEach(o => { totals[o.username] = (totals[o.username]||0) + o.total; });
    const ranked = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const box = document.getElementById('leaderboard-list');
    box.innerHTML = ranked.length ? ranked.map(([name,total],i) => `
      <div class="chip p-3 rounded flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="font-display font-bold text-sm" style="color:${i===0?'var(--amber)':i===1?'#C0C0C0':i===2?'#CD7F32':'var(--muted)'}">#${i+1}</span>
          <span class="font-bold">${esc(name)}</span>
        </div>
        <span style="color:var(--accent)">${fmt(total)}</span>
      </div>`).join('') : `<p class="text-center py-6" style="color:var(--muted)">No approved orders yet</p>`;
  });
}

function renderReferral(){
  if(!currentUser){ document.getElementById('referral-code').innerText = 'Login first'; return; }
  const code = 'GH-' + userProfile.username.toUpperCase().slice(0,6) + '-' + currentUser.uid.slice(0,4).toUpperCase();
  document.getElementById('referral-code').innerText = code;
}

function copyReferral(){
  const code = document.getElementById('referral-code').innerText;
  if(code === '—' || code === 'Login first'){ toast('Login first'); return; }
  navigator.clipboard?.writeText(code).then(()=>toast('Referral code copied'));
}
window.copyReferral = copyReferral;

async function redeemGiftCode(){
  if(!currentUser){ toast('Login required'); return; }
  const code = document.getElementById('giftcode-input').value.trim().toUpperCase();
  if(!code){ toast('Enter code'); return; }
  const q = query(collection(db, 'giftCodes'), where('code', '==', code));
  const snap = await getDocs(q);
  if(snap.empty){ toast('❌ Invalid code'); return; }
  const codeDoc = snap.docs[0];
  const data = codeDoc.data();
  const usedBy = data.usedBy || [];
  if(usedBy.includes(currentUser.uid)){ toast('❌ Already used'); return; }
  if(data.maxUses && usedBy.length >= data.maxUses){ toast('❌ Limit reached'); return; }
  await updateDoc(doc(db, 'users', currentUser.uid), { balance: increment(data.amount) });
  await updateDoc(doc(db, 'giftCodes', codeDoc.id), { usedBy: arrayUnion(currentUser.uid) });
  toast('✅ ' + fmt(data.amount) + ' bonus added!');
  document.getElementById('giftcode-input').value = '';
}
window.redeemGiftCode = redeemGiftCode;

async function submitRequest(){
  if(!currentUser){ toast('Login required'); return; }
  const title = document.getElementById('req-title').value.trim();
  const details = document.getElementById('req-details').value.trim();
  if(!title){ toast('Enter product name'); return; }
  await addDoc(collection(db, 'customRequests'), {
    userId: currentUser.uid, username: userProfile.username,
    title, details, status: 'pending', createdAt: serverTimestamp()
  });
  document.getElementById('req-title').value = '';
  document.getElementById('req-details').value = '';
  toast('✅ Request sent');
}
window.submitRequest = submitRequest;

async function spinWheel(){
  if(!currentUser){ toast('Login required'); return; }
  const now = Date.now();
  if(now - lastSpinAt < 86400000){ toast('Already spun today'); return; }
  const prizes = [0, 3, 5, 7, 10, 15];
  const pct = prizes[Math.floor(Math.random() * prizes.length)];
  lastSpinAt = now;
  if(pct > 0){
    document.getElementById('spin-result').innerText = `🎉 You won ${pct}% discount!`;
    toast('🎉 ' + pct + '% discount won!');
  } else {
    document.getElementById('spin-result').innerText = '😔 No luck this time';
    toast('Try again tomorrow');
  }
}
window.spinWheel = spinWheel;

document.addEventListener('DOMContentLoaded', () => { go('home'); });
