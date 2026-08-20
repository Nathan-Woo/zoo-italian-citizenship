import { el, mount, toast, typeLabel } from "../dom.js";
import {
  listenAllMasters, listenManagingMasters, listenContent, listenPacks,
  includeMaster, removeIncludedMaster, hideMaster, unhideMaster,
} from "../db.js";

/**
 * Lets a master or student see everyone else's content libraries and
 * choose to include (pull into their own practice/quiz pool) or hide
 * (declutter this list) each other master's library. Sharing is at the
 * whole-master level for simplicity — packs within an included master's
 * library become available for filtering in Practice/Self-Study/Quizzes.
 */
export function renderBrowse(container, { viewerProfile }) {
  let masters = [];
  let managingMasterIds = new Set(); // students only: masters via their roster — always included
  let allContent = [];
  let packs = [];
  let showHidden = false;

  const isStudent = viewerProfile.role === "student";

  listenAllMasters((list) => { masters = list; draw(); });
  listenContent((list) => { allContent = list; draw(); });
  listenPacks((list) => { packs = list; draw(); });
  if (isStudent) {
    listenManagingMasters(viewerProfile.id, (list) => {
      managingMasterIds = new Set(list.map((m) => m.id));
      draw();
    });
  }

  function draw() {
    const included = new Set(viewerProfile.includedMasterIds || []);
    const hidden = new Set(viewerProfile.hiddenMasterIds || []);

    const others = masters.filter((m) => m.id !== viewerProfile.id);
    const visible = others.filter((m) => !hidden.has(m.id));
    const hiddenList = others.filter((m) => hidden.has(m.id));

    const cards = visible.map((m) => renderMasterCard(m, included.has(m.id) || managingMasterIds.has(m.id), managingMasterIds.has(m.id)));

    mount(container, el("div", { class: "view" }, [
      el("h2", { class: "view-title" }, "Browse"),
      el("p", { class: "muted" }, isStudent
        ? "See every master's content library. Include one to pull its packs into your Practice and Self-Study options."
        : "See every other master's content library. Include one to pull its packs into your own quiz-building and content pool."),
      el("div", { class: "list" }, cards.length ? cards : [el("p", { class: "muted" }, "No other masters yet.")]),
      hiddenList.length
        ? el("div", {}, [
            el("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: () => { showHidden = !showHidden; draw(); } }, showHidden ? "Hide the hidden list" : `Show hidden (${hiddenList.length})`),
            showHidden ? el("div", { class: "list" }, hiddenList.map((m) => renderHiddenRow(m))) : null,
          ])
        : null,
    ]));
  }

  function renderMasterCard(m, isIncluded, isRosterMaster) {
    const masterContent = allContent.filter((c) => c.createdBy === m.id);
    const masterPacks = packs.filter((p) => p.createdBy === m.id);

    return el("div", { class: "panel browse-card" }, [
      el("div", { class: "panel__head" }, [
        el("div", {}, [
          el("strong", {}, m.displayName || m.email),
          el("p", { class: "muted small" }, `${masterContent.length} items · ${masterPacks.length} packs`),
        ]),
        isRosterMaster
          ? el("span", { class: "chip chip--static" }, "Your teacher")
          : el("div", { class: "row-actions" }, [
              isIncluded
                ? el("button", { class: "btn btn--ghost btn--sm", onclick: async () => { await removeIncludedMaster(viewerProfile.id, m.id); toast("Removed from your sources.", "info"); } }, "Remove")
                : el("button", { class: "btn btn--primary btn--sm", onclick: async () => { await includeMaster(viewerProfile.id, m.id); toast(`Included ${m.displayName}'s library.`, "success"); } }, "Include"),
              el("button", { class: "btn btn--ghost btn--sm btn--danger", onclick: async () => { await hideMaster(viewerProfile.id, m.id); toast("Hidden.", "info"); } }, "Hide"),
            ]),
      ]),
      masterPacks.length
        ? el("div", { class: "chip-row" }, masterPacks.map((p) =>
            el("span", { class: "chip chip--static" }, `${p.name} (${allContent.filter((c) => (c.packIds || []).includes(p.id)).length})`)
          ))
        : null,
    ]);
  }

  function renderHiddenRow(m) {
    return el("div", { class: "list-row" }, [
      el("strong", {}, m.displayName || m.email),
      el("button", { class: "btn btn--ghost btn--sm", onclick: async () => { await unhideMaster(viewerProfile.id, m.id); toast("Unhidden.", "info"); } }, "Unhide"),
    ]);
  }
}
