// ── Firebase initialization ──────────────────────────────────────────────
// Paste the config object from Firebase Console → Project settings →
// "Your apps" → SDK setup and configuration. Same place you got the one
// for Zoo's Joint Finances.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCGPm4DiKgJn38QYC479U14ZDQTKWP_p0A",
  authDomain: "zoo-italian-citizenship.firebaseapp.com",
  projectId: "zoo-italian-citizenship",
  storageBucket: "zoo-italian-citizenship.firebasestorage.app",
  messagingSenderId: "152159320100",
  appId: "1:152159320100:web:8c9d47ba118b09fd4f00b1"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// This project's Firestore database isn't named "(default)" — it's
// named "zooo". getFirestore() connects to "(default)" unless told
// otherwise, so every request was silently hitting a database that
// doesn't exist under that name, which the SDK reports as "client is
// offline" rather than a clearer "not found." Passing the database ID
// explicitly as the second argument fixes it.
// (Check yours in Firebase Console → Firestore Database — the database
// ID is shown near the top of that page. If you ever create a new
// database and want to skip this step, choose "(default)" as its ID
// when creating it.)
const FIRESTORE_DATABASE_ID = "zooo";

export const db = getFirestore(app, FIRESTORE_DATABASE_ID);

export const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence).catch((err) =>
  console.error("Auth persistence error:", err)
);

console.log("Firebase project:", firebaseConfig.projectId, "| Firestore database:", FIRESTORE_DATABASE_ID);
