// =====================================================
// 果果家 KOKOYA · 購物網前端 Firebase 設定（公開讀取）
// 與後台共用同一個 Firebase 專案，但只用得到讀 items + 寫 webOrders
// =====================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBiRLtPYl399g_0w0WVRLpo2wi3WKwqGa8",
  authDomain: "kokoya-b5e5c.firebaseapp.com",
  projectId: "kokoya-b5e5c",
  storageBucket: "kokoya-b5e5c.firebasestorage.app",
  messagingSenderId: "306715168839",
  appId: "1:306715168839:web:e9e007c5b02c174fc96162"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

export { db, collection, doc, addDoc, getDocs, query, orderBy, serverTimestamp, Timestamp };
