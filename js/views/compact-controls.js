import { el } from "../dom.js";

/**
 * A small tap-to-cycle control — shows a tiny label and the current
 * value; tapping cycles to the next option. Used to pack several
 * settings (prompt language, prompt mode, response language, response
 * mode) into one compact horizontal row instead of four stacked
 * dropdowns.
 *
 * options: [{ value, display }]
 * Returns { node, getValue(), setValue(v) }.
 */
export function createMiniToggle({ label, options, value, onChange }) {
  let current = value ?? options[0].value;

  const valueEl = el("span", { class: "mini-toggle__value" }, "");

  function render() {
    const opt = options.find((o) => o.value === current) || options[0];
    valueEl.textContent = opt.display;
  }
  render();

  const btn = el("button", {
    type: "button",
    class: "mini-toggle",
    onclick: () => {
      const idx = options.findIndex((o) => o.value === current);
      current = options[(idx + 1) % options.length].value;
      render();
      onChange && onChange(current);
    },
  }, [
    el("span", { class: "mini-toggle__label" }, label),
    valueEl,
  ]);

  return {
    node: btn,
    getValue: () => current,
    setValue: (v) => { current = v; render(); },
  };
}

/**
 * A type-to-search combobox over a list of {id, label, sublabel} items.
 * Calling getSelected() returns the chosen item's id, or null.
 */
export function createSearchSelect({ items, placeholder, onSelect }) {
  let selectedId = null;
  let query = "";
  let open = false;

  const input = el("input", { type: "text", placeholder: placeholder || "Type to search…" });
  const resultsBox = el("div", { class: "search-select__results hidden" });
  const wrap = el("div", { class: "search-select" }, [input, resultsBox]);

  function matches() {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 30);
    return items.filter((it) =>
      it.label.toLowerCase().includes(q) || (it.sublabel || "").toLowerCase().includes(q)
    ).slice(0, 30);
  }

  function drawResults() {
    resultsBox.innerHTML = "";
    if (!open) { resultsBox.classList.add("hidden"); return; }
    const results = matches();
    if (!results.length) {
      resultsBox.appendChild(el("div", { class: "search-select__empty" }, "No matches"));
    } else {
      results.forEach((it) => {
        resultsBox.appendChild(el("button", {
          type: "button",
          class: "search-select__option",
          onclick: () => {
            selectedId = it.id;
            query = it.label;
            input.value = it.label;
            open = false;
            drawResults();
            onSelect && onSelect(it.id);
          },
        }, [
          el("span", {}, it.label),
          it.sublabel ? el("span", { class: "muted small" }, it.sublabel) : null,
        ]));
      });
    }
    resultsBox.classList.remove("hidden");
  }

  input.addEventListener("input", () => {
    query = input.value;
    selectedId = null;
    open = true;
    drawResults();
  });
  input.addEventListener("focus", () => { open = true; drawResults(); });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) { open = false; drawResults(); }
  });

  return {
    node: wrap,
    getSelectedId: () => selectedId,
    clear: () => { selectedId = null; query = ""; input.value = ""; },
  };
}
