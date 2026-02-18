import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore/lite";

const firebaseConfig = {
  apiKey: "AIzaSyCMKgckRUPV9t5KVavRbWHwyl9a0-j6-WY",
  authDomain: "wet-check-app.firebaseapp.com",
  projectId: "wet-check-app",
  storageBucket: "wet-check-app.firebasestorage.app",
  messagingSenderId: "612475135163",
  appId: "1:612475135163:web:59e74d1967b1a096d9759e",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
