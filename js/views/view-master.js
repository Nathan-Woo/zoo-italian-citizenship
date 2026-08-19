import { el, mount, toast, fmtDate, typeLabel, stampBadge } from "../dom.js";
import {
  listenContent, addContent, updateContent, deleteContent,
  listenQuizzes, createQuiz, deleteQuiz,
  listenAllSubmissionsForQuiz, gradeSubmission,
  listenAllStudents, listenPointsLog,
  listenRewards, addReward, updateReward, deleteReward,
  getSelfStudySettings, updateSelfStudySettings,
} from "../db.js";
import { createRecorderWidget, playButton } from "./audio-widget.js";
import { uploadAudioBlob, deleteAudio } from "../audio.js";
import { renderPointsChart } from "../charts.js";

const TYPES = ["vocab", "phrase", "sentence", "conjugation"];

/* ── Content Library ──────────────────────────────────────────────── */

export function renderContentLibrary(container, uid) {
  let items = [];
  let filterType = "all";
  let editing = null; // content item being edited, or {} for new
  let removeAudioFlag = false;

  listenContent((list) => { items = list; draw(); });

  function draw() {
    const filtered = filterType === "all" ? items : items.filter((i) => i.type === filterType);

    const tabs = el("div", { class: "tabbar" }, ["all", ...TYPES].map((t) =>
      el("button", {
        class: `tab ${filterType === t ? "tab--active" : ""}`,
        onclick: () => { filterType = t; draw(); },
      }, t === "all" ? "All" : typeLabel(t))
    ));

    const table = el("div", { class: "list" }, filtered.length
      ? filtered.map((item) => el("div", { class: "list-row" }, [
          el("div", {}, [
            el("span", { class: "chip chip--static" }, typeLabel(item.type)),
            el("strong", {}, ` ${item.italian} `),
            el("span", { class: "muted" }, `→ ${item.english}`),
            item.hint ? el("div", { class: "muted small" }, `Hint: ${item.hint}`) : null,
          ]),
          el("div", { class: "row-actions" }, [
            item.audioURL ? playButton(item.audioURL) : el("span", { class: "muted small" }, "No audio"),
            el("button", { class: "btn btn--ghost btn--sm", onclick: () => { editing = item; removeAudioFlag = false; draw(); } }, "Edit"),
            el("button", { class: "btn btn--ghost btn--sm btn--danger", onclick: () => handleDelete(item) }, "Delete"),
          ]),
        ]))
      : [el("p", { class: "muted" }, "Nothing here yet.")]);

    mount(container, el("div", { class: "view" }, [
      el("div", { class: "panel__head" }, [
        el("h2", { class: "view-title" }, "Content Library"),
        el("button", { class: "btn btn--primary btn--sm", onclick: () => { editing = {}; removeAudioFlag = false; draw(); } }, "+ Add entry"),
      ]),
      tabs,
      table,
      editing ? renderEditor() : null,
    ]));
  }

  async function handleDelete(item) {
    if (!confirm(`Delete "${item.italian}"? This can't be undone.`)) return;
    if (item.audioPath) await deleteAudio(item.audioPath);
    await deleteContent(item.id);
    toast("Deleted.", "info");
  }

  function renderEditor() {
    const isNew = !editing.id;
    let recorderWidget = null;

    const form = el("form", { class: "editor-card", onsubmit: handleSave }, [
      el("h3", {}, isNew ? "New content" : "Edit content"),
      el("label", { class: "field" }, [
        el("span", {}, "Category"),
        el("select", { name: "type" }, TYPES.map((t) =>
          el("option", { value: t, selected: editing.type === t }, typeLabel(t))
        )),
      ]),
      el("label", { class: "field" }, [
        el("span", {}, "Italian"),
        el("input", { name: "italian", required: true, value: editing.italian || "" }),
      ]),
      el("label", { class: "field" }, [
        el("span", {}, "English (use / to separate accepted alternates)"),
        el("input", { name: "english", required: true, value: editing.english || "" }),
      ]),
      el("label", { class: "field" }, [
        el("span", {}, "Hint (optional)"),
        el("input", { name: "hint", value: editing.hint || "" }),
      ]),
      el("label", { class: "field" }, [
        el("span", {}, "Group/tag (optional — e.g. 'essere' for a conjugation set)"),
        el("input", { name: "tags", value: editing.tags || "" }),
      ]),
      el("div", { class: "field" }, [
        el("span", {}, "Voice recording (Italian pronunciation)"),
        editing.audioURL && !removeAudioFlag
          ? el("div", { class: "row-actions" }, [
              playButton(editing.audioURL),
              el("button", { type: "button", class: "btn btn--ghost btn--sm btn--danger", onclick: () => { removeAudioFlag = true; draw(); } }, "Remove"),
            ])
          : (() => { recorderWidget = createRecorderWidget(); return recorderWidget.node; })(),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { type: "submit", class: "btn btn--primary" }, "Save"),
        el("button", { type: "button", class: "btn btn--ghost", onclick: () => { editing = null; removeAudioFlag = false; draw(); } }, "Cancel"),
      ]),
    ]);

    async function handleSave(e) {
      e.preventDefault();
      const fd = new FormData(form);
      const data = {
        type: fd.get("type"),
        italian: fd.get("italian").trim(),
        english: fd.get("english").trim(),
        hint: fd.get("hint").trim() || null,
        tags: fd.get("tags").trim() || null,
        createdBy: uid,
      };
      try {
        let id = editing.id;
        if (isNew) {
          const ref = await addContent(data);
          id = ref.id;
        } else {
          await updateContent(id, data);
        }
        if (removeAudioFlag && editing.audioPath) {
          await deleteAudio(editing.audioPath);
          await updateContent(id, { audioURL: null, audioPath: null });
        }
        if (recorderWidget && recorderWidget.getBlob()) {
          const path = `audio/content/${id}.webm`;
          const url = await uploadAudioBlob(recorderWidget.getBlob(), path);
          await updateContent(id, { audioURL: url, audioPath: path });
        }
        toast("Saved.", "success");
        editing = null;
        removeAudioFlag = false;
        draw();
      } catch (err) {
        toast(err.message, "error");
      }
    }

    return form;
  }
}

/* ── Quiz Builder ─────────────────────────────────────────────────── */

export function renderQuizBuilder(container, uid) {
  let quizzes = [];
  let students = [];
  let content = [];
  let building = false;
  let draftItems = [];

  listenQuizzes((q) => { quizzes = q; draw(); });
  listenAllStudents((s) => { students = s; draw(); });
  listenContent((c) => { content = c; draw(); });

  function draw() {
    mount(container, el("div", { class: "view" }, [
      el("div", { class: "panel__head" }, [
        el("h2", { class: "view-title" }, "Quizzes"),
        el("button", { class: "btn btn--primary btn--sm", onclick: () => { building = true; draftItems = []; draw(); } }, "+ New quiz"),
      ]),
      building ? renderBuilder() : null,
      el("div", { class: "list" }, quizzes.length ? quizzes.map((q) => el("div", { class: "list-row" }, [
        el("div", {}, [
          el("strong", {}, q.title),
          el("p", { class: "muted" }, `Assigned to ${q.assignedTo === "all" ? "all students" : (students.find((s) => s.id === q.assignedTo)?.displayName || "a student")} · ${q.items.length} items · ${fmtDate(q.createdAt)}`),
        ]),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn--ghost btn--sm", onclick: () => renderGradingFor(q) }, "Grade"),
          el("button", { class: "btn btn--ghost btn--sm btn--danger", onclick: async () => { if (confirm("Delete this quiz?")) { await deleteQuiz(q.id); toast("Deleted.", "info"); } } }, "Delete"),
        ]),
      ])) : [el("p", { class: "muted" }, "No quizzes created yet.")]),
      el("div", { id: "grading-panel" }),
    ]));
  }

  function renderBuilder() {
    const itemsHost = el("div", { class: "list" });

    function drawItems() {
      const rows = draftItems.map((it, i) => el("div", { class: "list-row" }, [
        el("div", {}, [
          el("strong", {}, `${it.promptLang === "it" ? "IT" : "EN"} → ${it.responseLang === "it" ? "IT" : "EN"}`),
          el("span", { class: "muted" }, ` · ${it.promptMode === "audio" ? "audio prompt" : `"${it.promptText}"`} · respond by ${it.responseMode} · ${it.points} pt`),
        ]),
        el("button", { class: "btn btn--ghost btn--sm btn--danger", type: "button", onclick: () => { draftItems.splice(i, 1); drawItems(); } }, "Remove"),
      ]));
      mount(itemsHost, el("div", {}, rows.length ? rows : [el("p", { class: "muted" }, "No items added yet.")]));
    }

    const contentSelect = el("select", { name: "contentId" }, content.map((c) =>
      el("option", { value: c.id }, `[${typeLabel(c.type)}] ${c.italian} / ${c.english}`)
    ));
    const promptLangSelect = el("select", { name: "promptLang" }, [
      el("option", { value: "it" }, "Italian"),
      el("option", { value: "en" }, "English"),
    ]);
    const responseLangSelect = el("select", { name: "responseLang" }, [
      el("option", { value: "en" }, "English"),
      el("option", { value: "it" }, "Italian"),
    ]);
    const promptModeSelect = el("select", { name: "promptMode" }, [
      el("option", { value: "text" }, "Typed"),
      el("option", { value: "audio" }, "Your voice recording"),
    ]);
    const responseModeSelect = el("select", { name: "responseMode" }, [
      el("option", { value: "text" }, "Typed"),
      el("option", { value: "audio" }, "Student's voice recording"),
    ]);
    const pointsInput = el("input", { type: "number", name: "points", value: "5", min: "1" });

    let itemRecorder = null;
    const audioSlot = el("div");
    promptModeSelect.addEventListener("change", () => {
      if (promptModeSelect.value === "audio") {
        itemRecorder = createRecorderWidget();
        mount(audioSlot, itemRecorder.node);
      } else {
        itemRecorder = null;
        mount(audioSlot, el("span"));
      }
    });

    const addItemBtn = el("button", { type: "button", class: "btn btn--ghost" }, "+ Add item to quiz");
    addItemBtn.addEventListener("click", async () => {
      const c = content.find((x) => x.id === contentSelect.value);
      if (!c) { toast("Add some content to the library first.", "error"); return; }
      const promptMode = promptModeSelect.value;
      let promptText = null;
      let promptAudioURL = null;
      if (promptMode === "audio") {
        const blob = itemRecorder?.getBlob();
        if (!blob) { toast("Record the prompt audio first.", "error"); return; }
        const path = `audio/quiz-prompts/${uid}-${Date.now()}.webm`;
        promptAudioURL = await uploadAudioBlob(blob, path);
      } else {
        promptText = promptLangSelect.value === "it" ? c.italian : c.english;
      }
      draftItems.push({
        contentId: c.id,
        promptLang: promptLangSelect.value,
        responseLang: responseLangSelect.value,
        promptMode,
        promptText,
        promptAudioURL,
        responseMode: responseModeSelect.value,
        points: Number(pointsInput.value) || 1,
      });
      itemRecorder = null;
      mount(audioSlot, el("span"));
      drawItems();
    });

    const assignSelect = el("select", { name: "assignedTo" }, [
      el("option", { value: "all" }, "All students"),
      ...students.map((s) => el("option", { value: s.id }, s.displayName || s.email)),
    ]);
    const titleInput = el("input", { name: "title", placeholder: "e.g. Week 3 vocab check", required: true });

    const saveBtn = el("button", { type: "button", class: "btn btn--primary" }, "Save & assign quiz");
    saveBtn.addEventListener("click", async () => {
      if (!titleInput.value.trim()) { toast("Give the quiz a title.", "error"); return; }
      if (!draftItems.length) { toast("Add at least one item.", "error"); return; }
      await createQuiz({
        title: titleInput.value.trim(),
        assignedTo: assignSelect.value,
        items: draftItems,
        createdBy: uid,
      });
      toast("Quiz created!", "success");
      building = false;
      draftItems = [];
      draw();
    });

    drawItems();

    return el("div", { class: "editor-card" }, [
      el("h3", {}, "Build a quiz"),
      el("label", { class: "field" }, [el("span", {}, "Title"), titleInput]),
      el("label", { class: "field" }, [el("span", {}, "Assign to"), assignSelect]),
      el("div", { class: "builder-grid" }, [
        el("label", { class: "field" }, [el("span", {}, "Content item"), contentSelect]),
        el("label", { class: "field" }, [el("span", {}, "Prompt language"), promptLangSelect]),
        el("label", { class: "field" }, [el("span", {}, "Prompt presented as"), promptModeSelect]),
        audioSlot,
        el("label", { class: "field" }, [el("span", {}, "Student responds in"), responseLangSelect]),
        el("label", { class: "field" }, [el("span", {}, "Student responds as"), responseModeSelect]),
        el("label", { class: "field" }, [el("span", {}, "Points"), pointsInput]),
      ]),
      addItemBtn,
      el("h4", {}, "Items in this quiz"),
      itemsHost,
      el("div", { class: "row-actions" }, [
        saveBtn,
        el("button", { class: "btn btn--ghost", type: "button", onclick: () => { building = false; draw(); } }, "Cancel"),
      ]),
    ]);
  }

  function renderGradingFor(quiz) {
    const host = document.getElementById("grading-panel");
    let submissions = [];

    listenAllSubmissionsForQuiz(quiz.id, (subs) => {
      submissions = subs.filter((s) => s.status === "submitted");
      drawGrading();
    });

    function drawGrading() {
      mount(host, el("div", { class: "editor-card" }, [
        el("h3", {}, `Grade: ${quiz.title}`),
        submissions.length
          ? el("div", {}, submissions.map((sub) => renderSubmissionGrader(quiz, sub)))
          : el("p", { class: "muted" }, "Nothing waiting to be graded."),
      ]));
    }
  }

  function renderSubmissionGrader(quiz, sub) {
    const student = students.find((s) => s.id === sub.id);
    const marks = quiz.items.map(() => true); // default: correct

    const rows = quiz.items.map((item, i) => {
      const ans = sub.answers.find((a) => a.itemIndex === i) || {};
      return el("div", { class: "grade-row" }, [
        el("div", {}, [
          el("span", { class: "quiz-item__eyebrow" }, `Item ${i + 1} · ${item.points} pt`),
          item.promptMode === "audio" ? playButton(item.promptAudioURL, "▶ Prompt") : el("strong", {}, item.promptText),
        ]),
        el("div", { class: "grade-row__answer" }, [
          el("span", { class: "muted small" }, "Student answer:"),
          item.responseMode === "audio"
            ? playButton(ans.responseAudioURL, "▶ Response")
            : el("strong", {}, ans.responseText || "(blank)"),
        ]),
        el("label", { class: "grade-toggle" }, [
          el("input", {
            type: "checkbox",
            checked: true,
            onchange: (e) => { marks[i] = e.target.checked; },
          }),
          el("span", {}, "Correct"),
        ]),
      ]);
    });

    const submitBtn = el("button", { class: "btn btn--primary btn--sm", type: "button" }, "Save grades");
    submitBtn.addEventListener("click", async () => {
      const grading = quiz.items.map((item, i) => ({
        itemIndex: i,
        correct: marks[i],
        pointsAwarded: marks[i] ? item.points : 0,
      }));
      const total = grading.reduce((s, g) => s + g.pointsAwarded, 0);
      await gradeSubmission(quiz.id, sub.id, grading, total);
      toast(`Graded — ${total} pts awarded.`, "success");
    });

    return el("div", { class: "panel panel--nested" }, [
      el("h4", {}, student?.displayName || student?.email || "Student"),
      ...rows,
      submitBtn,
    ]);
  }
}

/* ── Rewards management ───────────────────────────────────────────── */

export function renderRewardsManager(container, uid) {
  let rewards = [];
  listenRewards((r) => { rewards = r; draw(); });

  function draw() {
    const list = el("div", { class: "list" }, rewards.length ? rewards.map((r) => el("div", { class: "list-row" }, [
      el("div", {}, [
        el("strong", {}, `${r.title} — ${r.pointThreshold} pts`),
        r.description ? el("p", { class: "muted" }, r.description) : null,
      ]),
      el("button", { class: "btn btn--ghost btn--sm btn--danger", onclick: async () => { await deleteReward(r.id); toast("Removed.", "info"); } }, "Delete"),
    ])) : [el("p", { class: "muted" }, "No rewards set yet.")]);

    const form = el("form", { class: "editor-card", onsubmit: handleAdd }, [
      el("h3", {}, "Add a reward"),
      el("label", { class: "field" }, [el("span", {}, "Title"), el("input", { name: "title", required: true })]),
      el("label", { class: "field" }, [el("span", {}, "Point threshold"), el("input", { name: "pointThreshold", type: "number", min: "1", required: true })]),
      el("label", { class: "field" }, [el("span", {}, "Description (optional)"), el("input", { name: "description" })]),
      el("button", { class: "btn btn--primary", type: "submit" }, "Add reward"),
    ]);

    async function handleAdd(e) {
      e.preventDefault();
      const fd = new FormData(form);
      await addReward({
        title: fd.get("title").trim(),
        pointThreshold: Number(fd.get("pointThreshold")),
        description: fd.get("description").trim() || null,
        createdBy: uid,
      });
      toast("Reward added.", "success");
      form.reset();
    }

    mount(container, el("div", { class: "view" }, [
      el("h2", { class: "view-title" }, "Rewards"),
      form,
      list,
    ]));
  }
}

/* ── Master dashboard: student overview ───────────────────────────── */

export function renderMasterDashboard(container) {
  let students = [];
  listenAllStudents((s) => { students = s; draw(); });

  function draw() {
    mount(container, el("div", { class: "view" }, [
      el("h2", { class: "view-title" }, "Students"),
      el("div", { class: "list" }, students.length ? students.map((s) => el("div", { class: "list-row" }, [
        el("div", {}, [
          el("strong", {}, s.displayName || s.email),
          el("p", { class: "muted" }, s.email),
        ]),
        el("span", { class: "hero-strip__number hero-strip__number--sm" }, String(s.totalPoints || 0)),
      ])) : [el("p", { class: "muted" }, "No students have signed up yet.")]),
    ]));
  }
}

/* ── Settings: self-study caps ────────────────────────────────────── */

export function renderMasterSettings(container) {
  getSelfStudySettings().then((settings) => {
    const form = el("form", { class: "editor-card", onsubmit: handleSave }, [
      el("h3", {}, "Self-study point rules"),
      el("label", { class: "field" }, [
        el("span", {}, "Points per correct self-study answer"),
        el("input", { name: "pointsPerCorrect", type: "number", min: "1", value: settings.pointsPerCorrect }),
      ]),
      el("label", { class: "field" }, [
        el("span", {}, "Maximum self-study points per day"),
        el("input", { name: "dailyMaxPoints", type: "number", min: "1", value: settings.dailyMaxPoints }),
      ]),
      el("button", { class: "btn btn--primary", type: "submit" }, "Save settings"),
    ]);

    async function handleSave(e) {
      e.preventDefault();
      const fd = new FormData(form);
      await updateSelfStudySettings({
        pointsPerCorrect: Number(fd.get("pointsPerCorrect")),
        dailyMaxPoints: Number(fd.get("dailyMaxPoints")),
      });
      toast("Settings saved.", "success");
    }

    mount(container, el("div", { class: "view" }, [
      el("h2", { class: "view-title" }, "Settings"),
      form,
      el("div", { class: "panel" }, [
        el("h3", {}, "Approve new sign-ups"),
        el("p", { class: "muted" }, "To let someone create an account, add a document to the allowedEmails collection in the Firebase console: document ID = their lowercase email address (any field inside is fine, e.g. addedAt: now)."),
      ]),
    ]));
  });
}
