// =====================================================
// 果果家 KOKOYA · Firebase 設定
// 請保持與 firebase.txt 一致
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  Timestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBiRLtPYl399g_0w0WVRLpo2wi3WKwqGa8",
  authDomain: "kokoya-b5e5c.firebaseapp.com",
  projectId: "kokoya-b5e5c",
  storageBucket: "kokoya-b5e5c.firebasestorage.app",
  messagingSenderId: "306715168839",
  appId: "1:306715168839:web:e9e007c5b02c174fc96162",
  measurementId: "G-CGBTGQZ6PX"
};

// 其他 API（地圖、AI 等）金鑰；自行視需求使用
export const EXTRA_API_KEY = "AIzaSyC55b4xbZUuRR6Gy1MCWJ_F1F452gaNi_s";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const provider = new GoogleAuthProvider();

export {
  app, auth, db, provider,
  signInWithPopup, signOut, onAuthStateChanged,
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, onSnapshot, Timestamp, runTransaction
};
