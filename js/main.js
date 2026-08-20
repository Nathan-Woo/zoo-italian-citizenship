import { watchAuthUser, logOut } from "./auth.js";
import { el, mount } from "./dom.js";
import {
  studentProfileId, masterProfileId,
  getProfileOnce, createProfile, addProfileToRoster, isAdminEmail,
} from "./db.js";
import { renderSignIn, renderRoleChoice } from "./views/view-onboarding.js";
import { renderFlashcards, renderSelfStudy } from "./views/view-practice.js";
import {
  renderStudentDashboard,
  renderStudentQuizzes,
  renderQuizRunner,
} from "./views/view-student.js";
import {
  renderContentLibrary,
  renderQuizBuilder,
  renderRewardsManager,
  renderMasterDashboard,
  renderMasterSettings,
} from "./views/view-master.js";
import { renderBrowse } from "./views/view-browse.js";

const app = document.getElementById("app");

const STUDENT_TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "quizzes", label: "Quizzes" },
  { key: "flashcards", label: "Practice" },
  { key: "selfstudy", label: "Self-Study" },
  { key: "browse", label: "Browse" },
];

const MASTER_TABS = [
  { key: "dashboard", label: "Roster" },
  { key: "content", label: "Content Library" },
  { key: "quizzes", label: "Quizzes" },
  { key: "rewards", label: "Rewards" },
  { key: "browse", label: "Browse" },
  { key: "settings", label: "Settings" },
];

let authUser = null;
let isAdminAccount = false;
let studentProfile = null; // {id, role:'student', ...} | null
let masterProfile = null;  // {id, role:'master', ...} | null
let activeRole = null;     // 'student' | 'master' | null
let activeTab = "dashboard";

function lastRoleKey(uid) { return `zoo-it-citizenship:lastRole:${uid}`; }

watchAuthUser(async (user) => {
  authUser = user;
  isAdminAccount = false;
  studentProfile = null;
  masterProfile = null;
  activeRole = null;

  if (!user) { render(); return; }

  await loadProfilesFor(user);
});

async function loadProfilesFor(user) {
  renderConnecting();
  try {
    const [sp, mp, admin] = await Promise.all([
      getProfileOnce(studentProfileId(user.uid)),
      getProfileOnce(masterProfileId(user.uid)),
      isAdminEmail(user.email),
    ]);
    studentProfile = sp;
    masterProfile = mp;
    isAdminAccount = admin;

    const remembered = localStorage.getItem(lastRoleKey(user.uid));
    if (remembered === "student" && studentProfile) activeRole = "student";
    else if (remembered === "master" && masterProfile) activeRole = "master";
    else if (studentProfile) activeRole = "student";
    else if (masterProfile) activeRole = "master";
    // else: neither profile exists yet — role choice screen will show.

    activeTab = "dashboard";
    render();
  } catch (err) {
    console.error("Firestore connection error — code:", err?.code, "| message:", err?.message, err);
    renderConnectionError(err, () => loadProfilesFor(user));
  }
}

function renderConnecting() {
  mount(app, el("div", { class: "auth-screen" }, [
    el("div", { class: "auth-screen__art" }),
    el("div", { class: "auth-card" }, [
      el("span", { class: "auth-eyebrow" }, "MOD. IT-CIT · CONNESSIONE"),
      el("h1", { class: "auth-title" }, "One moment…"),
      el("p", { class: "auth-sub" }, "Connecting to Firestore."),
    ]),
  ]));
}

function renderConnectionError(err, onRetry) {
  mount(app, el("div", { class: "auth-screen" }, [
    el("div", { class: "auth-screen__art" }),
    el("div", { class: "auth-card" }, [
      el("span", { class: "auth-eyebrow" }, "MOD. IT-CIT · ERRORE"),
      el("h1", { class: "auth-title" }, "Couldn't reach the database"),
      el("p", { class: "auth-sub" }, "You're signed in, but the app can't read from Firestore right now."),
      el("p", { class: "muted small" }, `Code: ${err?.code || "unknown"}`),
      el("p", { class: "muted small" }, err?.message || String(err)),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn--primary", onclick: onRetry }, "Try again"),
        el("button", { class: "btn btn--ghost", onclick: logOut }, "Log out"),
      ]),
    ]),
  ]));
}

function render() {
  if (!authUser) { renderSignIn(app); return; }

  if (!activeRole) {
    renderRoleChoice(app, { onChoose: handleChooseRole, existingRole: null, uid: authUser.uid });
    return;
  }

  renderShell();
}

async function handleChooseRole(role, username) {
  const profile = await createProfile({
    profileId: role === "student" ? studentProfileId(authUser.uid) : masterProfileId(authUser.uid),
    uid: authUser.uid,
    role,
    email: authUser.email,
    username,
    isAdmin: isAdminAccount,
  });
  if (role === "student") studentProfile = profile; else masterProfile = profile;
  activeRole = role;
  localStorage.setItem(lastRoleKey(authUser.uid), role);
  activeTab = "dashboard";
  render();
}

function switchRole(role) {
  activeRole = role;
  localStorage.setItem(lastRoleKey(authUser.uid), role);
  activeTab = "dashboard";
  renderShell();
}

function renderShell() {
  const isMaster = activeRole === "master";
  const tabs = isMaster ? MASTER_TABS : STUDENT_TABS;
  const hasBothProfiles = !!studentProfile && !!masterProfile;

  // Switching between student/master is an admin-only privilege — a
  // regular account keeps whichever role it first chose.
  let roleSwitcher = null;
  if (isAdminAccount) {
    roleSwitcher = hasBothProfiles
      ? el("div", { class: "role-switch" }, [
          el("button", {
            class: `role-switch__pill ${!isMaster ? "role-switch__pill--active" : ""}`,
            onclick: () => switchRole("student"),
          }, "Studente"),
          el("button", {
            class: `role-switch__pill ${isMaster ? "role-switch__pill--active" : ""}`,
            onclick: () => switchRole("master"),
          }, "Maestro"),
        ])
      : el("button", {
          class: "btn btn--ghost btn--sm",
          onclick: () => {
            renderRoleChoice(app, {
              onChoose: handleChooseRole,
              existingRole: activeRole,
              existingUsername: (isMaster ? masterProfile : studentProfile)?.displayName,
              uid: authUser.uid,
            });
          },
        }, `+ Try as ${isMaster ? "Studente" : "Maestro"}`);
  }

  const nav = el("nav", { class: "app-nav" }, [
    el("div", { class: "app-nav__top" }, [
      el("div", { class: "app-nav__brand" }, [
        el("span", { class: "app-nav__emblem" }, "🛂"),
        el("div", {}, [
          el("span", { class: "app-nav__title" }, "Zoo's Italian Citizenship"),
          el("span", { class: "app-nav__role" }, (isMaster ? "Maestro" : "Studente") + (isAdminAccount ? " · Admin" : "")),
        ]),
      ]),
      el("div", { class: "app-nav__top-actions" }, [
        roleSwitcher,
        el("button", { class: "btn btn--ghost btn--sm app-nav__logout", onclick: logOut }, "Log out"),
      ]),
    ]),
    el("div", { class: "app-nav__tabs" }, tabs.map((t) =>
      el("button", {
        class: `app-nav__tab ${activeTab === t.key ? "app-nav__tab--active" : ""}`,
        onclick: () => { activeTab = t.key; renderShell(); },
      }, t.label)
    )),
  ]);

  const main = el("main", { class: "app-main" });

  mount(app, el("div", { class: "app-shell" }, [nav, main]));
  renderTab(main, isMaster);
}

function renderTab(main, isMaster) {
  if (isMaster) {
    const mpId = masterProfile.id;
    if (activeTab === "dashboard") {
      return renderMasterDashboard(main, {
        masterProfileId: mpId,
        hasOwnStudentProfile: !!studentProfile,
        onAddSelfAsStudent: async () => {
          if (!studentProfile) {
            studentProfile = await createProfile({
              profileId: studentProfileId(authUser.uid),
              uid: authUser.uid,
              role: "student",
              email: authUser.email,
              username: masterProfile.displayName,
              isAdmin: isAdminAccount,
            });
          }
          await addProfileToRoster(mpId, studentProfile.id);
        },
      });
    }
    if (activeTab === "content") return renderContentLibrary(main, mpId, isAdminAccount);
    if (activeTab === "quizzes") return renderQuizBuilder(main, mpId);
    if (activeTab === "rewards") return renderRewardsManager(main, mpId, isAdminAccount);
    if (activeTab === "browse") return renderBrowse(main, { viewerProfile: masterProfile });
    if (activeTab === "settings") return renderMasterSettings(main, isAdminAccount);
  } else {
    const spId = studentProfile.id;
    if (activeTab === "dashboard") return renderStudentDashboard(main, spId);
    if (activeTab === "quizzes") {
      return renderStudentQuizzes(main, spId, (quiz) => {
        renderQuizRunner(main, spId, quiz, () => {
          activeTab = "quizzes";
          renderShell();
        });
      });
    }
    if (activeTab === "flashcards") return renderFlashcards(main, spId);
    if (activeTab === "selfstudy") return renderSelfStudy(main, spId);
    if (activeTab === "browse") return renderBrowse(main, { viewerProfile: studentProfile });
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
