import { auth, db } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/** Checks the allowedEmails/{email} doc. Throws if the email isn't on the list. */
export async function assertEmailAllowed(email) {
  const ref = doc(db, "allowedEmails", normalizeEmail(email));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error(
      "This email isn't approved for Zoo's Italian Citizenship yet. Add it to the allowedEmails collection in Firestore first."
    );
  }
}

export async function signUp({ email, password, displayName, role }) {
  const normalized = normalizeEmail(email);
  await assertEmailAllowed(normalized);
  if (role !== "student" && role !== "master") {
    throw new Error("Choose whether this account is a student or a master.");
  }
  const cred = await createUserWithEmailAndPassword(auth, normalized, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    email: normalized,
    displayName: displayName || normalized.split("@")[0],
    role,
    totalPoints: 0,
    createdAt: serverTimestamp(),
  });
  return cred.user;
}

export async function logIn({ email, password }) {
  const normalized = normalizeEmail(email);
  return signInWithEmailAndPassword(auth, normalized, password);
}

export async function logOut() {
  return signOut(auth);
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null, null);
      return;
    }
    const snap = await getDoc(doc(db, "users", user.uid));
    const profile = snap.exists() ? snap.data() : null;
    callback(user, profile);
  });
}
