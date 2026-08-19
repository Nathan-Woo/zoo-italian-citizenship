import { el, mount, toast, fmtDate, stampBadge, typeLabel } from "../dom.js";
import {
  listenQuizzes,
  listenSubmission,
  submitQuizAnswers,
  listenPointsLog,
  listenUserDoc,
  listenRewards,
} from "../db.js";
import { renderPointsChart } from "../charts.js";
import { createRecorderWidget, playButton } from "./audio-widget.js";
import { uploadAudioBlob } from "../audio.js";

/* ── Dashboard ────────────────────────────────────────────────────── */

export function renderStudentDashboard(container, uid) {
  let range = "week";
  let pointsLog = [];
  let profile = null;
  let rewards = [];

  listenPointsLog(uid, (log) => { pointsLog = log; draw(); });
  listenUserDoc(uid, (p) => { profile = p; draw(); });
  listenRewards((r) => { rewards = r; draw(); });

  function draw() {
    const total = profile?.totalPoints || 0;

    const rangeTabs = el("div", { class: "tabbar tabbar--sm" }, ["week", "month", "year"].map((r) =>
      el("button", {
        class: `tab ${range === r ? "tab--active" : ""}`,
        onclick: () => { range = r; draw(); },
      }, r[0].toUpperCase() + r.slice(1))
    ));

    const canvas = el("canvas", { class: "chart-canvas" });

    const rewardsList = el("div", { class: "reward-list" }, rewards.length
      ? rewards.map((r) => {
          const unlocked = total >= r.pointThreshold;
          const pct = Math.min(100, (total / r.pointThreshold) * 100);
          return el("div", { class: `reward ${unlocked ? "reward--unlocked" : ""}` }, [
            el("div", { class: "reward__top" }, [
              el("strong", {}, r.title),
              unlocked ? el("span", { class: "stamp stamp--ok stamp--sm" }, "SBLOCCATO") : el("span", { class: "muted" }, `${r.pointThreshold - total} to go`),
            ]),
            r.description ? el("p", { class: "muted" }, r.description) : null,
            el("div", { class: "cap-bar" }, [el("div", { class: "cap-bar__fill", style: `width:${pct}%` })]),
          ]);
        })
      : [el("p", { class: "muted" }, "Your maestro hasn't set any rewards yet.")]);

    mount(container, el("div", { class: "view" }, [
      el("div", { class: "hero-strip" }, [
        el("div", {}, [
          el("span", { class: "hero-strip__eyebrow" }, "PUNTI TOTALI"),
          el("span", { class: "hero-strip__number" }, String(total)),
        ]),
        el("div", { class: "passport-emblem" }, "IT"),
      ]),
      el("div", { class: "panel" }, [
        el("div", { class: "panel__head" }, [el("h3", {}, "Progress"), rangeTabs]),
        el("div", { class: "chart-wrap" }, canvas),
      ]),
      el("div", { class: "panel" }, [
        el("h3", {}, "Rewards"),
        rewardsList,
      ]),
    ]));

    requestAnimationFrame(() => renderPointsChart(canvas, pointsLog, range));
  }
}

/* ── Quiz list ────────────────────────────────────────────────────── */

export function renderStudentQuizzes(container, uid, openQuizRunner) {
  let quizzes = [];
  let submissionCache = new Map();
  let unsubs = [];

  listenQuizzes((list) => {
    quizzes = list.filter((q) => q.assignedTo === uid || q.assignedTo === "all");
    unsubs.forEach((u) => u());
    unsubs = [];
    quizzes.forEach((q) => {
      unsubs.push(listenSubmission(q.id, uid, (sub) => {
        submissionCache.set(q.id, sub);
        draw();
      }));
    });
    draw();
  });

  function draw() {
    const open = [];
    const done = [];
    quizzes.forEach((q) => {
      const sub = submissionCache.get(q.id);
      if (sub) done.push({ q, sub }); else open.push(q);
    });

    mount(container, el("div", { class: "view" }, [
      el("h2", { class: "view-title" }, "Quizzes"),
      el("h3", { class: "section-label" }, "Open"),
      open.length
        ? el("div", { class: "list" }, open.map((q) => el("div", { class: "list-row" }, [
            el("div", {}, [
              el("strong", {}, q.title),
              el("p", { class: "muted" }, `${q.items.length} item${q.items.length === 1 ? "" : "s"} · up to ${q.items.reduce((s, i) => s + (i.points || 0), 0)} pts`),
            ]),
            el("button", { class: "btn btn--primary btn--sm", onclick: () => openQuizRunner(q) }, "Start"),
          ])))
        : el("p", { class: "muted" }, "No open quizzes right now — nice work staying caught up."),

      el("h3", { class: "section-label" }, "Past quizzes"),
      done.length
        ? el("div", { class: "list" }, done.map(({ q, sub }) => el("div", { class: "list-row" }, [
            el("div", {}, [
              el("strong", {}, q.title),
              el("p", { class: "muted" }, sub.status === "graded"
                ? `Graded — ${sub.totalPointsAwarded || 0} pts`
                : "Submitted, awaiting grading"),
            ]),
            sub.status === "graded" ? stampBadge(true) : el("span", { class: "muted" }, "Pending"),
          ])))
        : el("p", { class: "muted" }, "No past quizzes yet."),
    ]));
  }
}

/* ── Quiz runner (taking a quiz) ──────────────────────────────────── */

export function renderQuizRunner(container, uid, quiz, onDone) {
  const answers = quiz.items.map(() => ({ responseText: "", blob: null }));
  const recorders = [];

  function itemRow(item, i) {
    const promptNode = item.promptMode === "audio"
      ? playButton(item.promptAudioURL, "▶ Play prompt")
      : el("strong", { class: "quiz-item__prompt-text" }, item.promptText);

    let responseNode;
    if (item.responseMode === "audio") {
      const widget = createRecorderWidget({ onChange: (blob) => { answers[i].blob = blob; } });
      recorders.push(widget);
      responseNode = widget.node;
    } else {
      responseNode = el("input", {
        type: "text",
        placeholder: `Answer in ${item.responseLang === "it" ? "Italian" : "English"}…`,
        oninput: (e) => { answers[i].responseText = e.target.value; },
      });
    }

    return el("div", { class: "quiz-item" }, [
      el("div", { class: "quiz-item__prompt" }, [
        el("span", { class: "quiz-item__eyebrow" }, `${item.promptLang === "it" ? "Italian" : "English"} → respond in ${item.responseLang === "it" ? "Italian" : "English"} · ${item.points} pt${item.points === 1 ? "" : "s"}`),
        promptNode,
      ]),
      responseNode,
    ]);
  }

  mount(container, el("div", { class: "view" }, [
    el("h2", { class: "view-title" }, quiz.title),
    el("div", { class: "panel" }, quiz.items.map(itemRow)),
    el("button", { class: "btn btn--primary", onclick: submit }, "Submit quiz"),
  ]));

  async function submit() {
    const btn = container.querySelector(".btn--primary");
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      const finalAnswers = [];
      for (let i = 0; i < quiz.items.length; i++) {
        const item = quiz.items[i];
        const a = answers[i];
        if (item.responseMode === "audio") {
          if (!a.blob) throw new Error(`Please record an answer for item ${i + 1}.`);
          const path = `quizzes/${quiz.id}/submissions/${uid}/${i}.webm`;
          const url = await uploadAudioBlob(a.blob, path);
          finalAnswers.push({ itemIndex: i, responseAudioURL: url, responseAudioPath: path });
        } else {
          finalAnswers.push({ itemIndex: i, responseText: a.responseText });
        }
      }
      await submitQuizAnswers(quiz.id, uid, finalAnswers);
      toast("Quiz submitted!", "success");
      onDone();
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Submit quiz";
    }
  }
}
