import { el, mount, toast, fmtDate, typeLabel, stampBadge } from "../dom.js";
import {
  listenContent, addContent, updateContent, deleteContent,
  listenPacks, addPack, deletePack,
  listenQuizzes, createQuiz, deleteQuiz,
  listenAllSubmissionsForQuiz, gradeSubmission,
  listenRoster, addStudentToRosterByUsername, removeStudentFromRoster,
  listenRewards, addReward, deleteReward,
  getSelfStudySettings, updateSelfStudySettings,
} from "../db.js";
import { createRecorderWidget, playButton } from "./audio-widget.js";
import { createMiniToggle, createSearchSelect } from "./compact-controls.js";
import { uploadAudioBlob, deleteAudio } from "../audio.js";
import { requestContentSuggestions } from "../ai.js";

const TYPES = ["vocab", "phrase", "sentence", "conjugation"];

/* ── Roster / master dashboard ────────────────────────────────────── */

export function renderMasterDashboard(container, { masterProfileId, hasOwnStudentProfile, onAddSelfAsStudent }) {
  let roster = [];
  listenRoster(masterProfileId, (r) => { roster = r; draw(); });

  function draw() {
    const usernameInput = el("input", { type: "text", placeholder: "e.g. Ari", required: true });
    const addForm = el("form", { class: "row-actions", onsubmit: handleAdd }, [
      usernameInput,
      el("button", { class: "btn btn--primary btn--sm", type: "submit" }, "Add to roster"),
    ]);

    async function handleAdd(e) {
      e.preventDefault();
      const result = await addStudentToRosterByUsername(masterProfileId, usernameInput.value);
      if (result === "added") toast("Added to your roster.", "success");
      else if (result === "already-in-roster") toast("Already on your roster.", "info");
      else toast("No student account found with that username yet — they need to sign in and choose Studente first.", "error");
      usernameInput.value = "";
    }

    mount(container, el("div", { class: "view" }, [
      el("div", { class: "panel__head" }, [
        el("h2", { class: "view-title" }, "Your Roster"),
      ]),
      el("div", { class: "panel" }, [
        el("h3", {}, "Add a student"),
        el("p", { class: "muted small" }, "Enter the username they chose when they set up their Studente account."),
        addForm,
        !hasOwnStudentProfile
          ? el("button", {
              class: "btn btn--ghost btn--sm",
              type: "button",
              onclick: async () => { await onAddSelfAsStudent(); toast("Your own student profile is set up and added.", "success"); },
            }, "+ Add my own account as a student (for testing)")
          : el("p", { class: "muted small" }, "Your own student profile is already on your roster if you added it."),
      ]),
      el("div", { class: "list" }, roster.length
        ? roster.map((s) => el("div", { class: "list-row" }, [
            el("div", {}, [
              el("strong", {}, s.displayName || s.email),
            ]),
            el("div", { class: "row-actions" }, [
              el("span", { class: "hero-strip__number hero-strip__number--sm" }, String(s.totalPoints || 0)),
              el("button", { class: "btn btn--ghost btn--sm btn--danger", onclick: async () => { await removeStudentFromRoster(masterProfileId, s.id); toast("Removed from roster.", "info"); } }, "Remove"),
            ]),
          ]))
        : [el("p", { class: "muted" }, "No students on your roster yet — add one above.")]),
    ]));
  }
}

/* ── Content Library ──────────────────────────────────────────────── */

export function renderContentLibrary(container, masterProfileId) {
  let items = [];
  let packs = [];
  let filterType = "all";
  let filterPack = "all";
  let editing = null;
  let removeAudioFlag = false;
  let editingPackIds = new Set();
  let showPacksPanel = false;
  let showSuggestPanel = false;

  listenContent((list) => { items = list; draw(); });
  listenPacks((list) => { packs = list; draw(); });

  function draw() {
    let filtered = filterType === "all" ? items : items.filter((i) => i.type === filterType);
    if (filterPack !== "all") filtered = filtered.filter((i) => (i.packIds || []).includes(filterPack));

    const typeTabs = el("div", { class: "tabbar" }, ["all", ...TYPES].map((t) =>
      el("button", {
        class: `tab ${filterType === t ? "tab--active" : ""}`,
        onclick: () => { filterType = t; draw(); },
      }, t === "all" ? "All types" : typeLabel(t))
    ));

    const packTabs = packs.length
      ? el("div", { class: "tabbar tabbar--sm" }, ["all", ...packs.map((p) => p.id)].map((pid) =>
          el("button", {
            class: `tab ${filterPack === pid ? "tab--active" : ""}`,
            onclick: () => { filterPack = pid; draw(); },
          }, pid === "all" ? "All packs" : packs.find((p) => p.id === pid).name)
        ))
      : null;

    const table = el("div", { class: "list" }, filtered.length
      ? filtered.map((item) => el("div", { class: "list-row" }, [
          el("div", {}, [
            el("span", { class: "chip chip--static" }, typeLabel(item.type)),
            el("strong", {}, ` ${item.italian} `),
            el("span", { class: "muted" }, `→ ${item.english}`),
            item.hint ? el("div", { class: "muted small" }, `Hint: ${item.hint}`) : null,
            (item.packIds || []).length
              ? el("div", { class: "muted small" }, `Packs: ${item.packIds.map((pid) => packs.find((p) => p.id === pid)?.name).filter(Boolean).join(", ")}`)
              : null,
          ]),
          el("div", { class: "row-actions" }, [
            item.audioURL ? playButton(item.audioURL) : el("span", { class: "muted small" }, "No audio"),
            el("button", { class: "btn btn--ghost btn--sm", onclick: () => { editing = item; removeAudioFlag = false; editingPackIds = new Set(item.packIds || []); draw(); } }, "Edit"),
            el("button", { class: "btn btn--ghost btn--sm btn--danger", onclick: () => handleDelete(item) }, "Delete"),
          ]),
        ]))
      : [el("p", { class: "muted" }, "Nothing here yet.")]);

    mount(container, el("div", { class: "view" }, [
      el("div", { class: "panel__head" }, [
        el("h2", { class: "view-title" }, "Content Library"),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn--ghost btn--sm", onclick: () => { showPacksPanel = !showPacksPanel; draw(); } }, showPacksPanel ? "Hide packs" : "Manage packs"),
          el("button", { class: "btn btn--ghost btn--sm", onclick: () => { showSuggestPanel = !showSuggestPanel; draw(); } }, "✨ Suggest for me"),
          el("button", { class: "btn btn--primary btn--sm", onclick: () => { editing = {}; removeAudioFlag = false; editingPackIds = new Set(); draw(); } }, "+ Add entry"),
        ]),
      ]),
      showPacksPanel ? renderPacksPanel() : null,
      showSuggestPanel ? renderSuggestPanel() : null,
      typeTabs,
      packTabs,
      table,
      editing ? renderEditor() : null,
    ]));
  }

  function renderPacksPanel() {
    const nameInput = el("input", { type: "text", placeholder: "e.g. Restaurant vocab, Chapter 3" });
    const addBtn = el("button", { class: "btn btn--primary btn--sm", type: "button" }, "+ Create pack");
    addBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) { toast("Give the pack a name.", "error"); return; }
      await addPack({ name, createdBy: masterProfileId });
      nameInput.value = "";
      toast("Pack created.", "success");
    });

    return el("div", { class: "editor-card" }, [
      el("h3", {}, "Packs"),
      el("p", { class: "muted small" }, "Group related content so students and quizzes can pull in a whole set at once."),
      el("div", { class: "row-actions" }, [nameInput, addBtn]),
      el("div", { class: "list" }, packs.length
        ? packs.map((p) => el("div", { class: "list-row" }, [
            el("div", {}, [
              el("strong", {}, p.name),
              el("p", { class: "muted small" }, `${items.filter((i) => (i.packIds || []).includes(p.id)).length} items`),
            ]),
            el("button", {
              class: "btn btn--ghost btn--sm btn--danger",
              onclick: async () => {
                if (!confirm(`Delete pack "${p.name}"? Items stay in the library, just ungrouped.`)) return;
                await deletePack(p.id);
                toast("Pack deleted.", "info");
              },
            }, "Delete"),
          ]))
        : [el("p", { class: "muted" }, "No packs yet.")]),
    ]);
  }

  function renderSuggestPanel() {
    const typeSelect = el("select", {}, [
      el("option", { value: "any" }, "Any type"),
      ...TYPES.map((t) => el("option", { value: t }, typeLabel(t))),
    ]);
    const countInput = el("input", { type: "number", min: "1", max: "20", value: "8" });
    const notesInput = el("textarea", { rows: "2", placeholder: "Optional: a theme or focus, e.g. \"ordering food at a restaurant\" or \"past tense of common verbs\"" });
    const generateBtn = el("button", { class: "btn btn--primary btn--sm", type: "button" }, "Generate suggestions");
    const resultsHost = el("div", { class: "list" });
    let suggestions = [];
    let accepted = new Set();

    generateBtn.addEventListener("click", async () => {
      generateBtn.disabled = true;
      generateBtn.textContent = "Thinking…";
      resultsHost.innerHTML = "";
      try {
        suggestions = await requestContentSuggestions({
          focusType: typeSelect.value,
          notes: notesInput.value,
          count: Number(countInput.value) || 8,
        });
        accepted = new Set(suggestions.map((_, i) => i));
        drawResults();
      } catch (err) {
        toast(err.message || "Couldn't get suggestions right now.", "error");
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = "Generate suggestions";
      }
    });

    function drawResults() {
      mount(resultsHost, el("div", {}, suggestions.length
        ? [
            ...suggestions.map((s, i) => el("label", { class: "list-row suggest-row" }, [
              el("input", {
                type: "checkbox",
                checked: accepted.has(i),
                onchange: (e) => { e.target.checked ? accepted.add(i) : accepted.delete(i); },
              }),
              el("div", {}, [
                el("span", { class: "chip chip--static" }, typeLabel(s.type)),
                el("strong", {}, ` ${s.italian} `),
                el("span", { class: "muted" }, `→ ${s.english}`),
                s.hint ? el("div", { class: "muted small" }, `Hint: ${s.hint}`) : null,
              ]),
            ])),
            el("button", {
              class: "btn btn--primary btn--sm",
              type: "button",
              onclick: async () => {
                const toAdd = suggestions.filter((_, i) => accepted.has(i));
                for (const s of toAdd) {
                  await addContent({ type: s.type, italian: s.italian, english: s.english, hint: s.hint || null, createdBy: masterProfileId });
                }
                toast(`Added ${toAdd.length} item${toAdd.length === 1 ? "" : "s"}.`, "success");
                suggestions = [];
                drawResults();
              },
            }, "Add selected to library"),
          ]
        : [el("p", { class: "muted" }, "No suggestions yet — fill in the options above and generate some.")]
      ));
    }

    return el("div", { class: "editor-card" }, [
      el("h3", {}, "✨ Suggest content"),
      el("p", { class: "muted small" }, "Uses AI to propose new vocab/phrases based on what's already in your library. Review before adding — nothing is saved automatically."),
      el("div", { class: "builder-grid" }, [
        el("label", { class: "field" }, [el("span", {}, "Type"), typeSelect]),
        el("label", { class: "field" }, [el("span", {}, "How many"), countInput]),
      ]),
      el("label", { class: "field" }, [el("span", {}, "Focus / theme (optional)"), notesInput]),
      generateBtn,
      resultsHost,
    ]);
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

    const packChips = el("div", { class: "chip-row" }, packs.length
      ? packs.map((p) => el("button", {
          type: "button",
          class: `chip ${editingPackIds.has(p.id) ? "chip--active" : ""}`,
          onclick: (e) => {
            if (editingPackIds.has(p.id)) editingPackIds.delete(p.id); else editingPackIds.add(p.id);
            e.currentTarget.classList.toggle("chip--active");
          },
        }, p.name))
      : [el("p", { class: "muted small" }, "No packs yet — create one above to organize entries.")]);

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
        el("span", {}, "Packs"),
        packChips,
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
        packIds: [...editingPackIds],
        createdBy: masterProfileId,
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

export function renderQuizBuilder(container, masterProfileId) {
  let rawQuizzes = [];
  let roster = [];
  let content = [];
  let packs = [];
  let building = false;
  let draftItems = [];
  let selectedStudentIds = new Set();

  listenQuizzes((q) => { rawQuizzes = q; draw(); });
  listenRoster(masterProfileId, (r) => { roster = r; draw(); });
  listenContent((c) => { content = c; draw(); });
  listenPacks((p) => { packs = p; draw(); });

  function draw() {
    const quizzes = rawQuizzes.filter((quiz) => quiz.createdBy === masterProfileId);

    mount(container, el("div", { class: "view" }, [
      el("div", { class: "panel__head" }, [
        el("h2", { class: "view-title" }, "Quizzes"),
        el("button", { class: "btn btn--primary btn--sm", onclick: () => { building = true; draftItems = []; selectedStudentIds = new Set(roster.map((s) => s.id)); draw(); } }, "+ New quiz"),
      ]),
      building ? renderBuilder() : null,
      el("div", { class: "list" }, quizzes.length ? quizzes.map((q) => el("div", { class: "list-row" }, [
        el("div", {}, [
          el("strong", {}, q.title),
          el("p", { class: "muted" }, `Assigned to ${(q.assignedTo || []).map((id) => roster.find((s) => s.id === id)?.displayName || "a student").join(", ") || "no one yet"} · ${q.items.length} items · ${fmtDate(q.createdAt)}`),
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
    if (!roster.length) {
      return el("div", { class: "editor-card" }, [
        el("p", { class: "muted" }, "Add at least one student to your roster before building a quiz."),
        el("button", { class: "btn btn--ghost", type: "button", onclick: () => { building = false; draw(); } }, "Close"),
      ]);
    }

    const itemsHost = el("div", { class: "list" });

    function drawItems() {
      const rows = draftItems.map((it, i) => el("div", { class: "list-row" }, [
        el("div", {}, [
          el("strong", {}, `${it.promptLang === "it" ? "IT" : "EN"} → ${it.responseLang === "it" ? "IT" : "EN"}`),
          el("span", { class: "muted" }, ` · ${it.promptMode === "audio" ? "🎙 audio prompt" : `"${it.promptText}"`} · reply by ${it.responseMode === "audio" ? "🎙" : "typing"} · ${it.points} pt`),
        ]),
        el("button", { class: "btn btn--ghost btn--sm btn--danger", type: "button", onclick: () => { draftItems.splice(i, 1); drawItems(); } }, "Remove"),
      ]));
      mount(itemsHost, el("div", {}, rows.length ? rows : [el("p", { class: "muted" }, "No items added yet.")]));
    }

    // Compact search-to-add content picker, replacing a giant <select>.
    const searchSelect = createSearchSelect({
      items: content.map((c) => ({
        id: c.id,
        label: `${c.italian} / ${c.english}`,
        sublabel: typeLabel(c.type) + (c.audioURL ? " · has audio" : ""),
      })),
      placeholder: "Type to search content…",
    });

    // Four compact tap-to-cycle controls instead of four stacked <select>s.
    const promptLangToggle = createMiniToggle({
      label: "PROMPT", options: [{ value: "it", display: "IT" }, { value: "en", display: "EN" }], value: "it",
    });
    const promptModeToggle = createMiniToggle({
      label: "AS", options: [{ value: "text", display: "Typed" }, { value: "audio", display: "🎙 Rec" }], value: "text",
    });
    const responseLangToggle = createMiniToggle({
      label: "REPLY", options: [{ value: "en", display: "EN" }, { value: "it", display: "IT" }], value: "en",
    });
    const responseModeToggle = createMiniToggle({
      label: "AS", options: [{ value: "text", display: "Typed" }, { value: "audio", display: "🎙 Rec" }], value: "text",
    });
    const pointsInput = el("input", { type: "number", value: "5", min: "1", class: "mini-points" });

    const toggleRow = el("div", { class: "mini-toggle-row" }, [
      promptLangToggle.node, promptModeToggle.node, responseLangToggle.node, responseModeToggle.node,
    ]);

    function buildItemFromContent(c, opts) {
      const promptMode = opts.promptMode;
      let promptText = null, promptAudioURL = null;
      if (promptMode === "audio") {
        if (!c.audioURL) return null; // caller decides whether to skip or warn
        promptAudioURL = c.audioURL;
      } else {
        promptText = opts.promptLang === "it" ? c.italian : c.english;
      }
      return {
        contentId: c.id,
        promptLang: opts.promptLang,
        responseLang: opts.responseLang,
        promptMode,
        promptText,
        promptAudioURL,
        responseMode: opts.responseMode,
        points: opts.points,
      };
    }

    const addItemBtn = el("button", { type: "button", class: "btn btn--ghost btn--sm" }, "+ Add item");
    addItemBtn.addEventListener("click", () => {
      const contentId = searchSelect.getSelectedId();
      const c = content.find((x) => x.id === contentId);
      if (!c) { toast("Search and pick a content item first.", "error"); return; }
      const opts = {
        promptLang: promptLangToggle.getValue(),
        promptMode: promptModeToggle.getValue(),
        responseLang: responseLangToggle.getValue(),
        responseMode: responseModeToggle.getValue(),
        points: Number(pointsInput.value) || 1,
      };
      const item = buildItemFromContent(c, opts);
      if (!item) {
        toast(`"${c.italian}" has no recording — add one in the Content Library first, or switch to Typed.`, "error");
        return;
      }
      draftItems.push(item);
      searchSelect.clear();
      drawItems();
    });

    const packSelect = el("select", {}, [
      el("option", { value: "" }, packs.length ? "Choose a pack…" : "No packs yet"),
      ...packs.map((p) => el("option", { value: p.id }, `${p.name} (${content.filter((c) => (c.packIds || []).includes(p.id)).length})`)),
    ]);
    const addPackBtn = el("button", { type: "button", class: "btn btn--ghost btn--sm" }, "+ Add entire pack");
    addPackBtn.addEventListener("click", () => {
      const packId = packSelect.value;
      if (!packId) { toast("Choose a pack first.", "error"); return; }
      const opts = {
        promptLang: promptLangToggle.getValue(),
        promptMode: promptModeToggle.getValue(),
        responseLang: responseLangToggle.getValue(),
        responseMode: responseModeToggle.getValue(),
        points: Number(pointsInput.value) || 1,
      };
      const packContent = content.filter((c) => (c.packIds || []).includes(packId));
      let added = 0, skipped = 0;
      packContent.forEach((c) => {
        const item = buildItemFromContent(c, opts);
        if (item) { draftItems.push(item); added++; } else { skipped++; }
      });
      drawItems();
      toast(`Added ${added} item${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} with no recording` : ""}.`, added ? "success" : "error");
    });

    const studentChecks = el("div", { class: "chip-row" }, roster.map((s) =>
      el("button", {
        type: "button",
        class: `chip ${selectedStudentIds.has(s.id) ? "chip--active" : ""}`,
        onclick: (e) => {
          if (selectedStudentIds.has(s.id)) selectedStudentIds.delete(s.id); else selectedStudentIds.add(s.id);
          e.target.classList.toggle("chip--active");
        },
      }, s.displayName || s.email)
    ));

    const titleInput = el("input", { name: "title", placeholder: "e.g. Week 3 vocab check", required: true });

    const saveBtn = el("button", { type: "button", class: "btn btn--primary" }, "Save & assign quiz");
    saveBtn.addEventListener("click", async () => {
      if (!titleInput.value.trim()) { toast("Give the quiz a title.", "error"); return; }
      if (!draftItems.length) { toast("Add at least one item.", "error"); return; }
      if (!selectedStudentIds.size) { toast("Select at least one student.", "error"); return; }
      await createQuiz({
        title: titleInput.value.trim(),
        assignedTo: [...selectedStudentIds],
        items: draftItems,
        createdBy: masterProfileId,
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
      el("label", { class: "field" }, [el("span", {}, "Assign to"), studentChecks]),

      el("label", { class: "field" }, [el("span", {}, "Find content"), searchSelect.node]),
      toggleRow,
      el("label", { class: "field field--inline" }, [el("span", {}, "Points"), pointsInput]),
      addItemBtn,

      el("div", { class: "pack-add-row" }, [packSelect, addPackBtn]),
      el("p", { class: "muted small" }, "Adding a pack uses the same Prompt/Reply settings above for every item in it."),

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
    const student = roster.find((s) => s.id === sub.id);
    const marks = quiz.items.map(() => true);

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
          el("input", { type: "checkbox", checked: true, onchange: (e) => { marks[i] = e.target.checked; } }),
          el("span", {}, "Correct"),
        ]),
      ]);
    });

    const submitBtn = el("button", { class: "btn btn--primary btn--sm", type: "button" }, "Save grades");
    submitBtn.addEventListener("click", async () => {
      const grading = quiz.items.map((item, i) => ({
        itemIndex: i, correct: marks[i], pointsAwarded: marks[i] ? item.points : 0,
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

export function renderRewardsManager(container, masterProfileId) {
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
        createdBy: masterProfileId,
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
        el("p", { class: "muted" }, "To let someone sign in with Google, add a document to the allowedEmails collection in the Firebase console: document ID = their lowercase Google email address (any field inside is fine, e.g. addedAt: now)."),
      ]),
    ]));
  });
}
