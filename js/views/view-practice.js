import { el, mount, toast, typeLabel } from "../dom.js";
import {
  listenContent, listenPacks, listenManagingMasters, listenProfile,
  getSelfStudySettings, getTodaysSelfStudyEarned, awardSelfStudyPoints,
} from "../db.js";
import { playButton } from "./audio-widget.js";
import { isAnswerCorrect } from "../grading.js";

const TYPES = ["vocab", "phrase", "sentence", "conjugation"];

/** Builds the set of master profileIds this student can draw content
 * from: whoever manages them (roster), plus anything they've opted
 * into via Browse. Calls back whenever either source changes. */
function watchSourceMasters(profileId, callback) {
  let managing = new Set();
  let included = new Set();
  const emit = () => callback(new Set([...managing, ...included]));
  const un1 = listenManagingMasters(profileId, (list) => { managing = new Set(list.map((m) => m.id)); emit(); });
  const un2 = listenProfile(profileId, (p) => { included = new Set(p?.includedMasterIds || []); emit(); });
  return () => { un1(); un2(); };
}

/* ── Flashcards ───────────────────────────────────────────────────── */

export function renderFlashcards(container, profileId) {
  let activeType = "vocab";
  let items = [];
  let sourceMasterIds = new Set();
  let selectedSource = "all";
  let index = 0;
  let flipped = false;
  let unsubscribeContent = null;

  watchSourceMasters(profileId, (ids) => { sourceMasterIds = ids; subscribe(); });

  function subscribe() {
    if (unsubscribeContent) unsubscribeContent();
    unsubscribeContent = listenContent((list) => {
      items = list.filter((c) => sourceMasterIds.has(c.createdBy));
      if (selectedSource !== "all") items = items.filter((c) => c.createdBy === selectedSource);
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
        el("p", { class: "muted" }, "Your teacher hasn't added any yet, or try including more sources in Browse."),
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
}

/* ── Self-study mini-quiz ─────────────────────────────────────────── */

export function renderSelfStudy(container, profileId) {
  let allContent = [];
  let packs = [];
  let sourceMasterIds = new Set();
  let selectedTypes = new Set(TYPES);
  let selectedPackId = "all";
  let selectedSource = "all";
  let count = 10;
  let session = null;
  let settings = null;
  let earnedToday = 0;

  async function init() {
    settings = await getSelfStudySettings();
    earnedToday = await getTodaysSelfStudyEarned(profileId);
    watchSourceMasters(profileId, (ids) => { sourceMasterIds = ids; drawSetup(); });
    listenPacks((list) => { packs = list; drawSetup(); });
    listenContent((list) => { allContent = list; drawSetup(); });
  }

  function availablePacks() {
    return packs.filter((p) => sourceMasterIds.has(p.createdBy));
  }

  function pool() {
    let p = allContent.filter((c) => sourceMasterIds.has(c.createdBy) && selectedTypes.has(c.type));
    if (selectedPackId !== "all") p = p.filter((c) => (c.packIds || []).includes(selectedPackId));
    if (selectedSource !== "all") p = p.filter((c) => c.createdBy === selectedSource);
    return p;
  }

  function drawSetup() {
    const currentPool = pool();
    const maxCount = Math.min(30, currentPool.length);

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

    const avPacks = availablePacks();
    const packToggles = avPacks.length
      ? el("div", { class: "chip-row" }, ["all", ...avPacks.map((p) => p.id)].map((pid) =>
          el("button", {
            class: `chip ${selectedPackId === pid ? "chip--active" : ""}`,
            type: "button",
            onclick: () => { selectedPackId = pid; drawSetup(); },
          }, pid === "all" ? "All packs" : `${avPacks.find((p) => p.id === pid).name}${avPacks.find((p) => p.id === pid).pointValue ? ` (+${avPacks.find((p) => p.id === pid).pointValue} perfect)` : ""}`)
        ))
      : null;

    const sourceMasters = [...sourceMasterIds];
    const sourceContentByMaster = {};
    sourceMasters.forEach((mid) => { sourceContentByMaster[mid] = allContent.filter((c) => c.createdBy === mid).length; });

    const sourceToggles = sourceMasters.length > 1
      ? el("div", { class: "chip-row" }, ["all", ...sourceMasters].map((mid) =>
          el("button", {
            class: `chip ${selectedSource === mid ? "chip--active" : ""}`,
            type: "button",
            onclick: () => { selectedSource = mid; drawSetup(); },
          }, mid === "all" ? "All sources" : `Source (${sourceContentByMaster[mid] || 0})`)
        ))
      : null;

    const remaining = Math.max(0, settings.dailyMaxPoints - earnedToday);
    const selectedPack = selectedPackId !== "all" ? avPacks.find((p) => p.id === selectedPackId) : null;

    mount(container, el("div", { class: "view" }, [
      el("h2", { class: "view-title" }, "Self-Study"),
      el("div", { class: "cap-banner" }, [
        el("span", {}, `Today's self-study points: ${earnedToday} / ${settings.dailyMaxPoints}`),
        el("div", { class: "cap-bar" }, [
          el("div", { class: "cap-bar__fill", style: `width:${Math.min(100, (earnedToday / settings.dailyMaxPoints) * 100)}%` }),
        ]),
      ]),
      el("div", { class: "panel" }, [
        el("label", { class: "field" }, [el("span", {}, "Categories"), typeToggles]),
        packToggles ? el("label", { class: "field" }, [el("span", {}, "Pack"), packToggles]) : null,
        sourceToggles ? el("label", { class: "field" }, [el("span", {}, "Source"), sourceToggles]) : null,
        selectedPack?.pointValue
          ? el("p", { class: "muted small" }, `Get every question right in this round and you'll earn a +${selectedPack.pointValue} point bonus, on top of normal per-question points.`)
          : null,
        el("label", { class: "field" }, [
          el("span", {}, `Number of questions (up to ${maxCount || 0} available)`),
          el("input", {
            type: "number", min: "1", max: String(maxCount || 1),
            value: String(Math.min(count, maxCount || 1)),
            oninput: (e) => { count = Number(e.target.value); },
          }),
        ]),
        remaining <= 0
          ? el("p", { class: "muted" }, "You've hit today's self-study point cap — practice is still open, just for review, no more points until tomorrow.")
          : null,
        el("button", {
          class: "btn btn--primary",
          disabled: !currentPool.length,
          onclick: () => startSession(currentPool, selectedPack),
        }, currentPool.length ? "Start practice" : "No content available yet"),
      ]),
    ]));
  }

  function startSession(poolItems, scopedPack) {
    const shuffled = [...poolItems].sort(() => Math.random() - 0.5).slice(0, Math.max(1, count));
    const distinctMasters = new Set(shuffled.map((c) => c.createdBy)).size;
    session = {
      items: shuffled.map((c) => ({ content: c, direction: Math.random() < 0.5 ? "it-en" : "en-it" })),
      answers: new Array(shuffled.length).fill(""),
      scopedPack,
      isMultiSource: distinctMasters > 1,
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
          type: "text", placeholder: `Type the ${targetLang.toLowerCase()}…`,
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

    const perQuestionRate = session.isMultiSource ? settings.pointsPerCorrectMultiSource : settings.pointsPerCorrectSingleSource;
    const rawPoints = correctCount * (perQuestionRate || 1);
    const awarded = await awardSelfStudyPoints(profileId, rawPoints);
    earnedToday += awarded;

    let bonusAwarded = 0;
    const isPerfect = correctCount === results.length && results.length > 0;
    if (isPerfect && session.scopedPack?.pointValue) {
      bonusAwarded = await awardSelfStudyPoints(profileId, session.scopedPack.pointValue);
      earnedToday += bonusAwarded;
    }

    mount(container, el("div", { class: "view" }, [
      el("h2", { class: "view-title" }, "Results"),
      el("p", { class: "results-summary" }, `${correctCount} / ${results.length} correct — +${awarded} point${awarded === 1 ? "" : "s"} earned${bonusAwarded ? `, +${bonusAwarded} perfect-pack bonus!` : ""}${awarded < rawPoints ? " (daily cap reached)" : ""}`),
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
