import { watchAuthUser, logOut } from "./auth.js";
import { el, mount } from "./dom.js";
import {
  studentProfileId, masterProfileId,
  getProfileOnce, createProfile, addProfileToRoster,
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

const app = document.getElementById("app");

const STUDENT_TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "quizzes", label: "Quizzes" },
  { key: "flashcards", label: "Practice" },
  { key: "selfstudy", label: "Self-Study" },
];

const MASTER_TABS = [
  { key: "dashboard", label: "Roster" },
  { key: "content", label: "Content Library" },
  { key: "quizzes", label: "Quizzes" },
  { key: "rewards", label: "Rewards" },
  { key: "settings", label: "Settings" },
];

let authUser = null;
let studentProfile = null; // {id, role:'student', ...} | null
let masterProfile = null;  // {id, role:'master', ...} | null
let activeRole = null;     // 'student' | 'master' | null
let activeTab = "dashboard";

function lastRoleKey(uid) { return `zoo-it-citizenship:lastRole:${uid}`; }

watchAuthUser(async (user) => {
  authUser = user;
  studentProfile = null;
  masterProfile = null;
  activeRole = null;

  if (!user) { render(); return; }

  const [sp, mp] = await Promise.all([
    getProfileOnce(studentProfileId(user.uid)),
    getProfileOnce(masterProfileId(user.uid)),
  ]);
  studentProfile = sp;
  masterProfile = mp;

  const remembered = localStorage.getItem(lastRoleKey(user.uid));
  if (remembered === "student" && studentProfile) activeRole = "student";
  else if (remembered === "master" && masterProfile) activeRole = "master";
  else if (studentProfile) activeRole = "student";
  else if (masterProfile) activeRole = "master";
  // else: neither profile exists yet — role choice screen will show.

  activeTab = "dashboard";
  render();
});

function render() {
  if (!authUser) { renderSignIn(app); return; }

  if (!activeRole) {
    renderRoleChoice(app, { onChoose: handleChooseRole, existingRole: null });
    return;
  }

  renderShell();
}

async function handleChooseRole(role) {
  const profile = await createProfile({
    profileId: role === "student" ? studentProfileId(authUser.uid) : masterProfileId(authUser.uid),
    uid: authUser.uid,
    role,
    email: authUser.email,
    displayName: authUser.displayName,
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

  const roleSwitcher = hasBothProfiles
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
          });
        },
      }, `+ Try as ${isMaster ? "Studente" : "Maestro"}`);

  const nav = el("nav", { class: "app-nav" }, [
    el("div", { class: "app-nav__brand" }, [
      el("span", { class: "app-nav__emblem" }, "🛂"),
      el("div", {}, [
        el("span", { class: "app-nav__title" }, "Zoo's Italian Citizenship"),
        el("span", { class: "app-nav__role" }, isMaster ? "Maestro" : "Studente"),
      ]),
    ]),
    el("div", { class: "app-nav__tabs" }, tabs.map((t) =>
      el("button", {
        class: `app-nav__tab ${activeTab === t.key ? "app-nav__tab--active" : ""}`,
        onclick: () => { activeTab = t.key; renderShell(); },
      }, t.label)
    )),
    roleSwitcher,
    el("button", { class: "btn btn--ghost btn--sm app-nav__logout", onclick: logOut }, "Log out"),
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
              displayName: authUser.displayName,
            });
          }
          await addProfileToRoster(mpId, studentProfile.id);
        },
      });
    }
    if (activeTab === "content") return renderContentLibrary(main, mpId);
    if (activeTab === "quizzes") return renderQuizBuilder(main, mpId);
    if (activeTab === "rewards") return renderRewardsManager(main, mpId);
    if (activeTab === "settings") return renderMasterSettings(main);
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
    if (activeTab === "flashcards") return renderFlashcards(main);
    if (activeTab === "selfstudy") return renderSelfStudy(main, spId);
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
