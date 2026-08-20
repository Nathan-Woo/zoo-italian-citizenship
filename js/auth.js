import { auth } from "./firebase-init.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/**
 * Google sign-in only — no passwords, nothing to type, no approval
 * needed to join. Anyone with a Google account can sign in and create a
 * profile. Elevated ("admin") privileges are a separate, narrower gate —
 * see isAdminEmail() in db.js — checked per-account, not at signup.
 */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function logOut() {
  return signOut(auth);
}

/** Fires with the raw Firebase Auth user (or null) — no profile/role logic here. */
export function watchAuthUser(callback) {
  return onAuthStateChanged(auth, (user) => callback(user));
}
