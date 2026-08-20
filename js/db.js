import { db } from "./firebase-init.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  arrayUnion,
  arrayRemove,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ── Profile IDs ──────────────────────────────────────────────────────
   One Google account (uid) can hold up to two separate "account files":
   a student profile and a master profile, so the same person can switch
   roles to test the app while keeping the data completely separate. ── */

export function studentProfileId(uid) { return `${uid}_student`; }
export function masterProfileId(uid) { return `${uid}_master`; }

export function listenProfile(profileId, callback) {
  return onSnapshot(doc(db, "profiles", profileId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function getProfileOnce(profileId) {
  const snap = await getDoc(doc(db, "profiles", profileId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Checks whether a username is already taken by someone else's profile
 * (excludeUid lets the same person reuse their username across their own
 * student/master profiles without it counting as a conflict). */
export async function isUsernameTaken(username, excludeUid = null) {
  const q = query(
    collection(db, "profiles"),
    where("usernameLower", "==", username.trim().toLowerCase()),
    limit(5)
  );
  const snap = await getDocs(q);
  return snap.docs.some((d) => d.data().uid !== excludeUid);
}

export async function createProfile({ profileId, uid, role, email, username }) {
  const cleanUsername = username.trim();
  const base = {
    uid, role, email,
    displayName: cleanUsername,
    usernameLower: cleanUsername.toLowerCase(),
    createdAt: serverTimestamp(),
  };
  const data = role === "student"
    ? { ...base, totalPoints: 0 }
    : { ...base, managedStudentIds: [] };
  await setDoc(doc(db, "profiles", profileId), data);
  return { id: profileId, ...data };
}

/* ── Roster (which students a master manages) ────────────────────── */

export function listenRoster(masterProfileId, callback) {
  return onSnapshot(doc(db, "profiles", masterProfileId), async (snap) => {
    const ids = snap.exists() ? (snap.data().managedStudentIds || []) : [];
    if (!ids.length) { callback([]); return; }
    const docs = await Promise.all(ids.map((id) => getDoc(doc(db, "profiles", id))));
    callback(docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** Looks up a student profile by their username and adds it to the
 * master's roster. Returns 'added' | 'already-in-roster' | 'not-found'. */
export async function addStudentToRosterByUsername(masterProfileId, username) {
  const q = query(
    collection(db, "profiles"),
    where("role", "==", "student"),
    where("usernameLower", "==", username.trim().toLowerCase()),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return "not-found";
  const studentDoc = snap.docs[0];
  const masterSnap = await getDoc(doc(db, "profiles", masterProfileId));
  const current = masterSnap.data()?.managedStudentIds || [];
  if (current.includes(studentDoc.id)) return "already-in-roster";
  await updateDoc(doc(db, "profiles", masterProfileId), {
    managedStudentIds: arrayUnion(studentDoc.id),
  });
  return "added";
}

export async function addProfileToRoster(masterProfileId, studentProfileId) {
  await updateDoc(doc(db, "profiles", masterProfileId), {
    managedStudentIds: arrayUnion(studentProfileId),
  });
}

export async function removeStudentFromRoster(masterProfileId, studentProfileId) {
  await updateDoc(doc(db, "profiles", masterProfileId), {
    managedStudentIds: arrayRemove(studentProfileId),
  });
}

/* ── Packs (named groupings of content, e.g. "Chapter 3", "Travel") ── */

export function listenPacks(callback) {
  const col = collection(db, "packs");
  return onSnapshot(query(col, orderBy("name", "asc")), (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export async function addPack(data) {
  return addDoc(collection(db, "packs"), { ...data, createdAt: serverTimestamp() });
}

export async function deletePack(id) {
  return deleteDoc(doc(db, "packs", id));
}

/* ── Content library (vocab / phrases / sentences / conjugations) ───── */

export function listenContent(callback, { type = null } = {}) {
  const col = collection(db, "content");
  const q = type ? query(col, where("type", "==", type)) : query(col);
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => (a.italian || "").localeCompare(b.italian || ""));
    callback(items);
  });
}

export async function addContent(data) {
  return addDoc(collection(db, "content"), { packIds: [], ...data, createdAt: serverTimestamp() });
}

export async function updateContent(id, data) {
  return updateDoc(doc(db, "content", id), data);
}

export async function deleteContent(id) {
  return deleteDoc(doc(db, "content", id));
}

/* ── Quizzes ──────────────────────────────────────────────────────── */
// assignedTo is always an array of student profileIds, resolved at
// creation time from whichever students the master selected.

export function listenQuizzes(callback) {
  const col = collection(db, "quizzes");
  return onSnapshot(query(col, orderBy("createdAt", "desc")), (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export function listenQuizzesForStudent(studentProfileId, callback) {
  const col = collection(db, "quizzes");
  const q = query(col, where("assignedTo", "array-contains", studentProfileId));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(items);
  });
}

export async function createQuiz(data) {
  return addDoc(collection(db, "quizzes"), { ...data, createdAt: serverTimestamp() });
}

export async function deleteQuiz(id) {
  return deleteDoc(doc(db, "quizzes", id));
}

export function listenSubmission(quizId, studentProfileId, callback) {
  const ref = doc(db, "quizzes", quizId, "submissions", studentProfileId);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function listenAllSubmissionsForQuiz(quizId, callback) {
  const col = collection(db, "quizzes", quizId, "submissions");
  return onSnapshot(col, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export async function submitQuizAnswers(quizId, studentProfileId, answers) {
  const ref = doc(db, "quizzes", quizId, "submissions", studentProfileId);
  return setDoc(ref, { answers, status: "submitted", submittedAt: serverTimestamp() });
}

export async function gradeSubmission(quizId, studentProfileId, grading, totalPointsAwarded) {
  const subRef = doc(db, "quizzes", quizId, "submissions", studentProfileId);
  await updateDoc(subRef, {
    grading, totalPointsAwarded, status: "graded", gradedAt: serverTimestamp(),
  });
  await awardPoints(studentProfileId, totalPointsAwarded, "quiz", quizId);
}

/* ── Points ledger (subcollection under the student's profile) ──────── */

export async function awardPoints(profileId, amount, source, refId) {
  if (!amount) return;
  const profileRef = doc(db, "profiles", profileId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(profileRef);
    const current = snap.exists() ? snap.data().totalPoints || 0 : 0;
    tx.update(profileRef, { totalPoints: current + amount });
  });
  await addDoc(collection(db, "profiles", profileId, "pointsLog"), {
    amount, source, refId: refId || null, createdAt: serverTimestamp(),
  });
}

export function listenPointsLog(profileId, callback) {
  const col = collection(db, "profiles", profileId, "pointsLog");
  return onSnapshot(query(col, orderBy("createdAt", "asc")), (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

/* ── Rewards ──────────────────────────────────────────────────────── */

export function listenRewards(callback) {
  const col = collection(db, "rewards");
  return onSnapshot(query(col, orderBy("pointThreshold", "asc")), (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export async function addReward(data) {
  return addDoc(collection(db, "rewards"), { ...data, createdAt: serverTimestamp() });
}

export async function deleteReward(id) {
  return deleteDoc(doc(db, "rewards", id));
}

/* ── Self-study settings & daily cap ─────────────────────────────── */

const DEFAULT_SELF_STUDY_SETTINGS = { dailyMaxPoints: 20, pointsPerCorrect: 2 };

export async function getSelfStudySettings() {
  const ref = doc(db, "settings", "selfStudy");
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  try {
    await setDoc(ref, DEFAULT_SELF_STUDY_SETTINGS);
  } catch (e) {
    // Not a master — fine, defaults are used in-memory for this session.
  }
  return DEFAULT_SELF_STUDY_SETTINGS;
}

export async function updateSelfStudySettings(data) {
  return setDoc(doc(db, "settings", "selfStudy"), data, { merge: true });
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getTodaysSelfStudyEarned(profileId) {
  const ref = doc(db, "profiles", profileId, "selfStudyLog", todayKey());
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data().earnedToday || 0 : 0;
}

export async function awardSelfStudyPoints(profileId, rawAmount) {
  const settings = await getSelfStudySettings();
  const ref = doc(db, "profiles", profileId, "selfStudyLog", todayKey());
  let awarded = 0;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const earnedToday = snap.exists() ? snap.data().earnedToday || 0 : 0;
    const room = Math.max(0, settings.dailyMaxPoints - earnedToday);
    awarded = Math.min(rawAmount, room);
    tx.set(ref, { earnedToday: earnedToday + awarded, date: todayKey() }, { merge: true });
  });
  if (awarded > 0) await awardPoints(profileId, awarded, "selfstudy", todayKey());
  return awarded;
}

export { Timestamp };
