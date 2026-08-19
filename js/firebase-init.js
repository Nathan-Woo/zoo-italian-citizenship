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
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

// Firestore's default real-time transport is a streaming connection.
// Some networks (corporate/school firewalls, antivirus with HTTPS
// inspection, some routers) let plain short HTTPS requests through fine
// but kill or mangle long-lived streaming ones — the SDK then reports
// "client is offline" even though the network itself is fine.
// experimentalForceLongPolling skips auto-detection (which can itself
// get confused on hostile networks) and forces plain long-polling
// outright. Slightly less efficient than streaming, but far more
// reliable on networks like this.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});

export const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence).catch((err) =>
  console.error("Auth persistence error:", err)
);

console.log("Firebase project:", firebaseConfig.projectId);
