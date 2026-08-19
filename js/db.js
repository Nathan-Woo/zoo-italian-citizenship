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
  onSnapshot,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
  return addDoc(collection(db, "content"), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function updateContent(id, data) {
  return updateDoc(doc(db, "content", id), data);
}

export async function deleteContent(id) {
  return deleteDoc(doc(db, "content", id));
}

/* ── Quizzes ──────────────────────────────────────────────────────── */

export function listenQuizzes(callback) {
  const col = collection(db, "quizzes");
  return onSnapshot(query(col, orderBy("createdAt", "desc")), (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export async function createQuiz(data) {
  return addDoc(collection(db, "quizzes"), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function deleteQuiz(id) {
  return deleteDoc(doc(db, "quizzes", id));
}

export function listenSubmission(quizId, studentUid, callback) {
  const ref = doc(db, "quizzes", quizId, "submissions", studentUid);
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

export async function submitQuizAnswers(quizId, studentUid, answers) {
  const ref = doc(db, "quizzes", quizId, "submissions", studentUid);
  return setDoc(ref, {
    answers,
    status: "submitted",
    submittedAt: serverTimestamp(),
  });
}

export async function gradeSubmission(quizId, studentUid, grading, totalPointsAwarded) {
  const subRef = doc(db, "quizzes", quizId, "submissions", studentUid);
  await updateDoc(subRef, {
    grading,
    totalPointsAwarded,
    status: "graded",
    gradedAt: serverTimestamp(),
  });
  await awardPoints(studentUid, totalPointsAwarded, "quiz", quizId);
}

/* ── Points ledger ────────────────────────────────────────────────── */

export async function awardPoints(uid, amount, source, refId) {
  if (!amount) return;
  const userRef = doc(db, "users", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const current = snap.exists() ? snap.data().totalPoints || 0 : 0;
    tx.update(userRef, { totalPoints: current + amount });
  });
  await addDoc(collection(db, "users", uid, "pointsLog"), {
    amount,
    source,
    refId: refId || null,
    createdAt: serverTimestamp(),
  });
}

export function listenPointsLog(uid, callback) {
  const col = collection(db, "users", uid, "pointsLog");
  return onSnapshot(query(col, orderBy("createdAt", "asc")), (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export function listenUserDoc(uid, callback) {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function listenAllStudents(callback) {
  const col = collection(db, "users");
  return onSnapshot(query(col, where("role", "==", "student")), (snap) => {
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

export async function updateReward(id, data) {
  return updateDoc(doc(db, "rewards", id), data);
}

export async function deleteReward(id) {
  return deleteDoc(doc(db, "rewards", id));
}

/* ── Self-study settings & daily cap ─────────────────────────────── */

export async function getSelfStudySettings() {
  const ref = doc(db, "settings", "selfStudy");
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const defaults = { dailyMaxPoints: 20, pointsPerCorrect: 2 };
  await setDoc(ref, defaults);
  return defaults;
}

export async function updateSelfStudySettings(data) {
  return setDoc(doc(db, "settings", "selfStudy"), data, { merge: true });
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export async function getTodaysSelfStudyEarned(uid) {
  const ref = doc(db, "users", uid, "selfStudyLog", todayKey());
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data().earnedToday || 0 : 0;
}

/** Awards self-study points, respecting the daily cap. Returns the amount actually awarded. */
export async function awardSelfStudyPoints(uid, rawAmount) {
  const settings = await getSelfStudySettings();
  const ref = doc(db, "users", uid, "selfStudyLog", todayKey());
  let awarded = 0;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const earnedToday = snap.exists() ? snap.data().earnedToday || 0 : 0;
    const room = Math.max(0, settings.dailyMaxPoints - earnedToday);
    awarded = Math.min(rawAmount, room);
    tx.set(
      ref,
      { earnedToday: earnedToday + awarded, date: todayKey() },
      { merge: true }
    );
  });
  if (awarded > 0) await awardPoints(uid, awarded, "selfstudy", todayKey());
  return awarded;
}

export { Timestamp };
