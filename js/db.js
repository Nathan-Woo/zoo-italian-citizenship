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
   roles to test the app while keeping the data completely separate.
   (Switching roles is now an admin-only privilege — see isAdminEmail.) */

export function studentProfileId(uid) { return `${uid}_student`; }
export function masterProfileId(uid) { return `${uid}_master`; }

/* ── Admin check ──────────────────────────────────────────────────── */

/** Approved/admin accounts get elevated powers: switching between
 * student and master, editing any master's content library, and
 * setting pack point values / global self-study point rates. Anyone
 * can still sign up and use the app as a regular master or student. */
export async function isAdminEmail(email) {
  const ref = doc(db, "adminEmails", email.trim().toLowerCase());
  const snap = await getDoc(ref);
  return snap.exists();
}

/* ── Profiles ─────────────────────────────────────────────────────── */

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

export async function createProfile({ profileId, uid, role, email, username, isAdmin }) {
  const cleanUsername = username.trim();
  const base = {
    uid, role, email,
    displayName: cleanUsername,
    usernameLower: cleanUsername.toLowerCase(),
    isAdmin: !!isAdmin,
    createdAt: serverTimestamp(),
  };
  const data = role === "student"
    ? { ...base, totalPoints: 0, includedMasterIds: [], hiddenMasterIds: [] }
    : { ...base, managedStudentIds: [], includedMasterIds: [], hiddenMasterIds: [] };
  await setDoc(doc(db, "profiles", profileId), data);
  return { id: profileId, ...data };
}

export function listenAllMasters(callback) {
  const q = query(collection(db, "profiles"), where("role", "==", "master"));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

/** Masters whose roster includes this student — the student's default
 * content sources, before any additional ones they opt into. */
export function listenManagingMasters(studentProfileId, callback) {
  const q = query(
    collection(db, "profiles"),
    where("role", "==", "master"),
    where("managedStudentIds", "array-contains", studentProfileId)
  );
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

/* ── Include / hide other masters (Browse tab, for both roles) ──────── */

export async function includeMaster(viewerProfileId, otherMasterId) {
  await updateDoc(doc(db, "profiles", viewerProfileId), {
    includedMasterIds: arrayUnion(otherMasterId),
    hiddenMasterIds: arrayRemove(otherMasterId),
  });
}
export async function removeIncludedMaster(viewerProfileId, otherMasterId) {
  await updateDoc(doc(db, "profiles", viewerProfileId), {
    includedMasterIds: arrayRemove(otherMasterId),
  });
}
export async function hideMaster(viewerProfileId, otherMasterId) {
  await updateDoc(doc(db, "profiles", viewerProfileId), {
    hiddenMasterIds: arrayUnion(otherMasterId),
    includedMasterIds: arrayRemove(otherMasterId),
  });
}
export async function unhideMaster(viewerProfileId, otherMasterId) {
  await updateDoc(doc(db, "profiles", viewerProfileId), {
    hiddenMasterIds: arrayRemove(otherMasterId),
  });
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

/* ── Packs ────────────────────────────────────────────────────────── */
// Every pack and content item is owned by exactly one master (createdBy).
// Only that owning master, or an admin, can edit or delete it.

export function listenPacks(callback) {
  const col = collection(db, "packs");
  return onSnapshot(query(col, orderBy("name", "asc")), (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export async function addPack(data) {
  return addDoc(collection(db, "packs"), { pointValue: null, ...data, createdAt: serverTimestamp() });
}

export async function renamePack(id, name) {
  return updateDoc(doc(db, "packs", id), { name });
}

/** Admin-only: the point bonus a student earns for a perfect self-study
 * round scoped to just this pack. */
export async function setPackPointValue(id, pointValue) {
  return updateDoc(doc(db, "packs", id), { pointValue: pointValue === "" ? null : Number(pointValue) });
}

export async function deletePack(id) {
  return deleteDoc(doc(db, "packs", id));
}

/* ── Content library ──────────────────────────────────────────────── */

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

export function canEdit(item, masterProfileId, isAdmin) {
  return isAdmin || item.createdBy === masterProfileId;
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

/* ── Points ledger ────────────────────────────────────────────────── */

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

/* ── Self-study settings & daily cap (admin-controlled) ──────────── */
// pointsPerCorrectSingleSource applies when a self-study round is scoped
// to one master's content only; pointsPerCorrectMultiSource applies when
// it spans more than one master. Packs can also carry a flat pointValue
// bonus (admin-set) awarded on a perfect round scoped to just that pack.

const DEFAULT_SELF_STUDY_SETTINGS = {
  dailyMaxPoints: 20,
  pointsPerCorrectSingleSource: 2,
  pointsPerCorrectMultiSource: 3,
};

export async function getSelfStudySettings() {
  const ref = doc(db, "settings", "selfStudy");
  const snap = await getDoc(ref);
  if (snap.exists()) return { ...DEFAULT_SELF_STUDY_SETTINGS, ...snap.data() };
  try {
    await setDoc(ref, DEFAULT_SELF_STUDY_SETTINGS);
  } catch (e) {
    // Not an admin — fine, defaults are used in-memory for this session.
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

/** Awards self-study points, respecting the daily cap. Returns the
 * amount actually awarded (may be less than requested if capped). */
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
