// ============================================================
// CONFIGURACIÓN DE FIREBASE
// ------------------------------------------------------------
// Reemplaza estos valores con los de tu proyecto Firebase:
// Firebase Console → ⚙️ Configuración del proyecto → General
// → "Tus apps" → App web → Configuración del SDK
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCT_Z1u1ikS2iOvmhq6hdyX9w1UFMzwg4w",
  authDomain: "cotizadoe-9c0d8.firebaseapp.com",
  projectId: "cotizadoe-9c0d8",
  storageBucket: "cotizadoe-9c0d8.firebasestorage.app",
  messagingSenderId: "1082710287679",
  appId: "1:1082710287679:web:e6157aee190fb009809f8a"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
