import { auth, db } from "./firebase-init.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Google sign-in only — no passwords, nothing to type. Optionally gated by
 * an `allowedEmails` allowlist, checked AFTER sign-in (so the check itself
 * is an authenticated read and can't trip up on Firestore's stricter
 * unauthenticated-read handling, which is what was likely behind the
 * "client is offline" error with the old email/password flow).
 */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  await assertEmailAllowed(cred.user.email);
  return cred.user;
}

async function assertEmailAllowed(email) {
  const ref = doc(db, "allowedEmails", email.trim().toLowerCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await signOut(auth);
    throw new Error(
      `${email} isn't approved yet. Add a document with this exact email as its ID to the allowedEmails collection in Firestore, then try again.`
    );
  }
}

export async function logOut() {
  return signOut(auth);
}

/** Fires with the raw Firebase Auth user (or null) — no profile/role logic here. */
export function watchAuthUser(callback) {
  return onAuthStateChanged(auth, (user) => callback(user));
}
