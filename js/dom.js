export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== undefined && v !== null && v !== false) {
      node.setAttribute(k, v === true ? "" : v);
    }
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === undefined || c === null || c === false) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(container, node) {
  clear(container);
  container.appendChild(node);
}

export function typeLabel(type) {
  return {
    vocab: "Vocabulario",
    phrase: "Frase",
    sentence: "Frase completa",
    conjugation: "Coniugazione",
  }[type] || type;
}

export function fmtDate(ts) {
  if (!ts || !ts.toDate) return "";
  return ts.toDate().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function toast(message, kind = "info") {
  const host = document.getElementById("toast-host");
  const node = el("div", { class: `toast toast--${kind}` }, message);
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add("toast--show"));
  setTimeout(() => {
    node.classList.remove("toast--show");
    setTimeout(() => node.remove(), 300);
  }, 3200);
}

export function stampBadge(correct) {
  return el(
    "span",
    { class: `stamp stamp--${correct ? "ok" : "no"}` },
    correct ? "APPROVATO" : "DA RIVEDERE"
  );
}
