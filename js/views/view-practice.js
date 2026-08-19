import { el, mount, toast, typeLabel } from "../dom.js";
import { listenContent, getSelfStudySettings, getTodaysSelfStudyEarned, awardSelfStudyPoints } from "../db.js";
import { playButton } from "./audio-widget.js";
import { isAnswerCorrect } from "../grading.js";

const TYPES = ["vocab", "phrase", "sentence", "conjugation"];

/* ── Flashcards ───────────────────────────────────────────────────── */

export function renderFlashcards(container) {
  let activeType = "vocab";
  let items = [];
  let index = 0;
  let flipped = false;
  let unsubscribe = null;

  function subscribe() {
    if (unsubscribe) unsubscribe();
    unsubscribe = listenContent((list) => {
      items = list;
      index = 0;
      flipped = false;
      draw();
    }, { type: activeType });
  }

  function draw() {
    const tabs = el("div", { class: "tabbar" }, TYPES.map((t) =>
      el("button", {
        class: `tab ${t === activeType ? "tab--active" : ""}`,
        onclick: () => { activeType = t; subscribe(); },
      }, typeLabel(t))
    ));

    let cardArea;
    if (!items.length) {
      cardArea = el("div", { class: "empty-state" }, [
        el("p", {}, `No ${typeLabel(activeType).toLowerCase()} entries yet.`),
        el("p", { class: "muted" }, "Ask your maestro to add some in the Content Library."),
      ]);
    } else {
      const item = items[index];
      cardArea = el("div", { class: "flash-wrap" }, [
        el("div", {
          class: `flashcard ${flipped ? "flashcard--flipped" : ""}`,
          onclick: () => { flipped = !flipped; draw(); },
        }, [
          el("div", { class: "flashcard__face flashcard__face--front" }, [
            el("span", { class: "flashcard__eyebrow" }, "ITALIANO"),
            el("span", { class: "flashcard__word" }, item.italian),
            item.audioURL ? playButton(item.audioURL) : null,
          ]),
          el("div", { class: "flashcard__face flashcard__face--back" }, [
            el("span", { class: "flashcard__eyebrow" }, "ENGLISH"),
            el("span", { class: "flashcard__word" }, item.english),
            item.hint ? el("p", { class: "flashcard__hint" }, `Hint: ${item.hint}`) : null,
          ]),
        ]),
        el("div", { class: "flash-nav" }, [
          el("button", { class: "btn btn--ghost", onclick: () => { index = (index - 1 + items.length) % items.length; flipped = false; draw(); } }, "‹ Prev"),
          el("span", { class: "flash-nav__count" }, `${index + 1} / ${items.length}`),
          el("button", { class: "btn btn--ghost", onclick: () => { index = (index + 1) % items.length; flipped = false; draw(); } }, "Next ›"),
        ]),
      ]);
    }

    mount(container, el("div", { class: "view" }, [
      el("h2", { class: "view-title" }, "Flashcards"),
      tabs,
      cardArea,
    ]));
  }

  subscribe();
}

/* ── Self-study mini-quiz ─────────────────────────────────────────── */

export function renderSelfStudy(container, uid) {
  let allContent = [];
  let selectedTypes = new Set(TYPES);
  let count = 10;
  let session = null; // { items, answers }
  let settings = null;
  let earnedToday = 0;

  async function init() {
    settings = await getSelfStudySettings();
    earnedToday = await getTodaysSelfStudyEarned(uid);
    listenContent((list) => { allContent = list; drawSetup(); });
  }

  function drawSetup() {
    const pool = allContent.filter((c) => selectedTypes.has(c.type));
    const maxCount = Math.min(30, pool.length);

    const typeToggles = el("div", { class: "chip-row" }, TYPES.map((t) =>
      el("button", {
        class: `chip ${selectedTypes.has(t) ? "chip--active" : ""}`,
        type: "button",
        onclick: () => {
          if (selectedTypes.has(t)) selectedTypes.delete(t); else selectedTypes.add(t);
          if (!selectedTypes.size) selectedTypes.add(t);
          drawSetup();
        },
      }, typeLabel(t))
    ));

    const remaining = Math.max(0, settings.dailyMaxPoints - earnedToday);

    mount(container, el("div", { class: "view" }, [
      el("h2", { class: "view-title" }, "Self-Study"),
      el("div", { class: "cap-banner" }, [
        el("span", {}, `Today's self-study points: ${earnedToday} / ${settings.dailyMaxPoints}`),
        el("div", { class: "cap-bar" }, [
          el("div", { class: "cap-bar__fill", style: `width:${Math.min(100, (earnedToday / settings.dailyMaxPoints) * 100)}%` }),
        ]),
      ]),
      el("div", { class: "panel" }, [
        el("label", { class: "field" }, [
          el("span", {}, "Categories"),
          typeToggles,
        ]),
        el("label", { class: "field" }, [
          el("span", {}, `Number of questions (up to ${maxCount || 0} available)`),
          el("input", {
            type: "number",
            min: "1",
            max: String(maxCount || 1),
            value: String(Math.min(count, maxCount || 1)),
            oninput: (e) => { count = Number(e.target.value); },
          }),
        ]),
        remaining <= 0
          ? el("p", { class: "muted" }, "You've hit today's self-study point cap — practice is still open, just for review, no more points until tomorrow.")
          : null,
        el("button", {
          class: "btn btn--primary",
          disabled: !pool.length,
          onclick: () => startSession(pool),
        }, pool.length ? "Start practice" : "No content available yet"),
      ]),
    ]));
  }

  function startSession(pool) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.max(1, count));
    session = {
      items: shuffled.map((c) => ({
        content: c,
        direction: Math.random() < 0.5 ? "it-en" : "en-it",
      })),
      answers: new Array(shuffled.length).fill(""),
    };
    drawSession();
  }

  function drawSession() {
    const rows = session.items.map((it, i) => {
      const promptText = it.direction === "it-en" ? it.content.italian : it.content.english;
      const targetLang = it.direction === "it-en" ? "English" : "Italian";
      return el("div", { class: "quiz-item" }, [
        el("div", { class: "quiz-item__prompt" }, [
          el("span", { class: "quiz-item__eyebrow" }, `${typeLabel(it.content.type)} · answer in ${targetLang}`),
          el("strong", {}, promptText),
        ]),
        el("input", {
          type: "text",
          placeholder: `Type the ${targetLang.toLowerCase()}…`,
          oninput: (e) => { session.answers[i] = e.target.value; },
        }),
      ]);
    });

    mount(container, el("div", { class: "view" }, [
      el("h2", { class: "view-title" }, "Self-Study — Practice Round"),
      el("div", { class: "panel" }, rows),
      el("button", { class: "btn btn--primary", onclick: finishSession }, "Grade my answers"),
    ]));
  }

  async function finishSession() {
    let correctCount = 0;
    const results = session.items.map((it, i) => {
      const correctAnswer = it.direction === "it-en" ? it.content.english : it.content.italian;
      const ok = isAnswerCorrect(session.answers[i], correctAnswer);
      if (ok) correctCount++;
      return { ...it, given: session.answers[i], correctAnswer, ok };
    });

    const rawPoints = correctCount * (settings.pointsPerCorrect || 1);
    const awarded = await awardSelfStudyPoints(uid, rawPoints);
    earnedToday += awarded;

    mount(container, el("div", { class: "view" }, [
      el("h2", { class: "view-title" }, "Results"),
      el("p", { class: "results-summary" }, `${correctCount} / ${results.length} correct — +${awarded} point${awarded === 1 ? "" : "s"} earned${awarded < rawPoints ? " (daily cap reached)" : ""}`),
      el("div", { class: "panel" }, results.map((r) =>
        el("div", { class: `quiz-item quiz-item--${r.ok ? "ok" : "no"}` }, [
          el("div", {}, [
            el("span", { class: "quiz-item__eyebrow" }, typeLabel(r.content.type)),
            el("strong", {}, r.direction === "it-en" ? r.content.italian : r.content.english),
          ]),
          el("div", { class: "quiz-item__answer" }, [
            el("span", {}, `Your answer: ${r.given || "(blank)"}`),
            el("span", {}, `Correct: ${r.correctAnswer}`),
          ]),
        ])
      )),
      el("button", { class: "btn btn--primary", onclick: drawSetup }, "Practice again"),
    ]));
  }

  init();
}
