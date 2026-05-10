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
  runTransaction,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBiRLtPYl399g_0w0WVRLpo2wi3WKwqGa8",
  authDomain: "kokoya-b5e5c.firebaseapp.com",
  projectId: "kokoya-b5e5c",
  storageBucket: "kokoya-b5e5c.firebasestorage.app",
  messagingSenderId: "306715168839",
  appId: "1:306715168839:web:e9e007c5b02c174fc96162",
  measurementId: "G-CGBTGQZ6PX"
};

// 注意：其他 API（如 Gemini AI）的金鑰已搬到 Firestore 的 settings/secrets，
// 不再寫在程式碼裡，避免 GitHub 公開 repo 被掃描標記為「金鑰外洩」。
// 請於登入後到「設定」頁的「🔑 API 金鑰」section 填入。

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

export {
  app, auth, db, storage, provider,
  signInWithPopup, signOut, onAuthStateChanged,
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, onSnapshot, Timestamp, runTransaction, writeBatch,
  storageRef, uploadBytes, getDownloadURL, deleteObject
};
