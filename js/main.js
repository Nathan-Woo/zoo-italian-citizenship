import { watchAuthState, logOut } from "./auth.js";
import { el, mount, clear } from "./dom.js";
import { renderAuth } from "./views/view-auth.js";
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
  { key: "dashboard", label: "Students" },
  { key: "content", label: "Content Library" },
  { key: "quizzes", label: "Quizzes" },
  { key: "rewards", label: "Rewards" },
  { key: "settings", label: "Settings" },
];

let currentUser = null;
let currentProfile = null;
let activeTab = "dashboard";

watchAuthState((user, profile) => {
  currentUser = user;
  currentProfile = profile;
  activeTab = "dashboard";
  render();
});

function render() {
  if (!currentUser || !currentProfile) {
    renderAuth(app);
    return;
  }
  renderShell();
}

function renderShell() {
  const isMaster = currentProfile.role === "master";
  const tabs = isMaster ? MASTER_TABS : STUDENT_TABS;

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
    el("button", { class: "btn btn--ghost btn--sm app-nav__logout", onclick: logOut }, "Log out"),
  ]);

  const main = el("main", { class: "app-main" });

  mount(app, el("div", { class: "app-shell" }, [nav, main]));
  renderTab(main, isMaster);
}

function renderTab(main, isMaster) {
  const uid = currentUser.uid;

  if (isMaster) {
    if (activeTab === "dashboard") return renderMasterDashboard(main);
    if (activeTab === "content") return renderContentLibrary(main, uid);
    if (activeTab === "quizzes") return renderQuizBuilder(main, uid);
    if (activeTab === "rewards") return renderRewardsManager(main, uid);
    if (activeTab === "settings") return renderMasterSettings(main);
  } else {
    if (activeTab === "dashboard") return renderStudentDashboard(main, uid);
    if (activeTab === "quizzes") {
      return renderStudentQuizzes(main, uid, (quiz) => {
        renderQuizRunner(main, uid, quiz, () => {
          activeTab = "quizzes";
          renderShell();
        });
      });
    }
    if (activeTab === "flashcards") return renderFlashcards(main);
    if (activeTab === "selfstudy") return renderSelfStudy(main, uid);
  }
}

// Register the PWA service worker.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
