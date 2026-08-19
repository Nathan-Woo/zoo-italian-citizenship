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
// Some networks/proxies/browser setups let plain HTTPS through fine but
// silently break that streaming channel, which the SDK then reports as
// "client is offline" even though the network is actually fine.
// experimentalAutoDetectLongPolling makes the SDK detect that case and
// fall back to plain long-polling instead — this is the standard fix
// for that exact symptom (see https://github.com/firebase/firebase-js-sdk/issues/1674).
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});

export const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence).catch((err) =>
  console.error("Auth persistence error:", err)
);

console.log("Firebase project:", firebaseConfig.projectId);
