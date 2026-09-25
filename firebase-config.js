import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, 
  onSnapshot, query, where, orderBy, serverTimestamp, increment, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBnyYeArMkPkqQM8oM1M1fBi8ZR8H7kTa0",
  authDomain: "gadgethub-bd.firebaseapp.com",
  databaseURL: "https://gadgethub-bd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "gadgethub-bd",
  storageBucket: "gadgethub-bd.firebasestorage.app",
  messagingSenderId: "193207703482",
  appId: "1:193207703482:web:1e24a1476503333986af83"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  app, auth, db,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, increment, arrayUnion
};