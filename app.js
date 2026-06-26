// maxims — a local, account-free sandbox for collecting words.
// state lives in localStorage; no network, no backend.

const KEY = "maxims.v1";

/** @typedef {{id:string,text:string,author:string,boards:string[],createdAt:number}} Quote */
/** @typedef {{id:string,name:string}} Board */

const SEED = [
  { text: "The unexamined life is not worth living.", author: "Socrates" },
  { text: "The limits of my language mean the limits of my world.", author: "Ludwig Wittgenstein" },
  { text: "We suffer more often in imagination than in reality.", author: "Seneca" },
  { text: "From the sublime to the ridiculous is but a step.", author: "Napoleon Bonaparte" },
  { text: "What is rational is actual; and what is actual is rational.", author: "Hegel" },
];

const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) || "id-" + Math.random().toString(36).slice(2);

// stable per-id hash, so each slip's tiny rotation + ink density never changes
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** @type {{quotes:Quote[],boards:Board[]}} */
let state = load();
let active = "all"; // "all" | boardId

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // first run: seed a few, newest-last so order reads naturally
  const now = Date.now();
  return {
    quotes: SEED.map((s, i) => ({
      id: uid(),
      text: s.text,
      author: s.author,
      boards: [],
      createdAt: now - (SEED.length - i) * 1000,
    })),
    boards: [],
  };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

// ---- elements ----
const wall = document.getElementById("wall");
const boardsNav = document.getElementById("boards");
const tpl = document.getElementById("card-tpl");
const quoteEl = document.getElementById("quote");
const authorEl = document.getElementById("author");
const keepBtn = document.getElementById("keep");
const popover = document.getElementById("popover");

// ---- composer ----
function autogrow() {
  quoteEl.style.height = "auto";
  quoteEl.style.height = Math.min(quoteEl.scrollHeight, 420) + "px";
  keepBtn.disabled = quoteEl.value.trim().length === 0;
}
quoteEl.addEventListener("input", autogrow);
quoteEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") keep();
});
keepBtn.addEventListener("click", keep);

function keep() {
  const text = quoteEl.value.trim();
  if (!text) return;
  const author = authorEl.value.trim();
  const q = {
    id: uid(),
    text,
    author,
    boards: active === "all" ? [] : [active],
    createdAt: Date.now(),
  };
  state.quotes.push(q);
  save();
  quoteEl.value = "";
  authorEl.value = "";
  autogrow();
  render(q.id);
  quoteEl.focus();
}

// ---- derived ----
const boardName = (id) => state.boards.find((b) => b.id === id)?.name ?? "";
function visibleQuotes() {
  const list =
    active === "all" ? state.quotes : state.quotes.filter((q) => q.boards.includes(active));
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

// ---- render ----
function renderBoards() {
  boardsNav.innerHTML = "";
  const mk = (label, id, count) => {
    const b = document.createElement("button");
    b.className = "tab";
    b.type = "button";
    b.dataset.board = id;
    b.setAttribute("aria-current", String(active === id));
    b.innerHTML = `${label}<span class="tab-count">${count}</span>`;
    b.addEventListener("click", () => {
      active = id;
      render();
    });
    return b;
  };
  boardsNav.append(mk("all", "all", state.quotes.length));
  for (const bd of state.boards) {
    boardsNav.append(
      mk(bd.name, bd.id, state.quotes.filter((q) => q.boards.includes(bd.id)).length)
    );
  }
  // + new board
  const add = document.createElement("button");
  add.className = "tab tab-new";
  add.type = "button";
  add.textContent = "+ board";
  add.addEventListener("click", () => startNewBoard(add));
  boardsNav.append(add);
}

function startNewBoard(anchorBtn) {
  const input = document.createElement("input");
  input.className = "board-input";
  input.placeholder = "name it…";
  anchorBtn.replaceWith(input);
  input.focus();
  const commit = () => {
    const name = input.value.trim();
    if (name) {
      const board = { id: uid(), name };
      state.boards.push(board);
      save();
      active = board.id;
    }
    render();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") render();
  });
  input.addEventListener("blur", commit);
}

function renderWall(enterId) {
  wall.innerHTML = "";
  const items = visibleQuotes();
  if (items.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent =
      active === "all"
        ? "nothing yet — keep your first maxim above."
        : "this board is empty. keep something here, or save an existing maxim to it.";
    wall.append(p);
    return;
  }
  for (const q of items) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = q.id;
    const qEl = node.querySelector(".q");
    qEl.textContent = q.text;
    // each slip typed a hair off-true, with its own ink density (stable per id)
    const h = hashStr(q.id);
    const rot = (((h % 1000) / 1000) - 0.5) * 0.9; // ±0.45deg
    const ink = 0.9 + ((h >> 5) % 100) / 1000; // 0.900–0.999
    qEl.style.setProperty("--rot", rot.toFixed(3) + "deg");
    qEl.style.setProperty("--ink-density", ink.toFixed(3));
    const auth = node.querySelector(".author");
    auth.textContent = q.author ? "— " + q.author : "";
    if (enterId && q.id === enterId) node.classList.add("enter");
    wall.append(node);
  }
}

function render(enterId) {
  renderBoards();
  renderWall(enterId);
}

// ---- card actions (event delegation) ----
wall.addEventListener("click", (e) => {
  const btn = e.target.closest(".act");
  if (!btn) return;
  const card = btn.closest(".card");
  const id = card?.dataset.id;
  const q = state.quotes.find((x) => x.id === id);
  if (!q) return;

  if (btn.classList.contains("act-del")) {
    state.quotes = state.quotes.filter((x) => x.id !== id);
    save();
    render();
  } else if (btn.classList.contains("act-copy")) {
    const text = q.author ? `${q.text} — ${q.author}` : q.text;
    navigator.clipboard?.writeText(text);
    flash(btn, "copied");
  } else if (btn.classList.contains("act-board")) {
    openPopover(q, btn);
  }
});

function flash(btn, label) {
  const prev = btn.textContent;
  btn.textContent = label;
  btn.classList.add("is-on");
  setTimeout(() => {
    btn.textContent = prev;
    btn.classList.remove("is-on");
  }, 1100);
}

// ---- board popover ----
function openPopover(q, anchor) {
  popover.innerHTML = "";
  const rebuild = () => buildPopover(q);
  buildPopover(q);

  function buildPopover(quote) {
    popover.innerHTML = "";
    if (state.boards.length === 0) {
      const hint = document.createElement("div");
      hint.className = "po-row";
      hint.style.color = "var(--muted)";
      hint.style.cursor = "default";
      hint.textContent = "no boards yet — make one:";
      popover.append(hint);
    }
    for (const bd of state.boards) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "po-row" + (quote.boards.includes(bd.id) ? " is-on" : "");
      row.innerHTML = `<span class="po-check">✓</span><span>${escapeHtml(bd.name)}</span>`;
      row.addEventListener("click", () => {
        toggleMembership(quote, bd.id);
        rebuild();
        renderBoards();
      });
      popover.append(row);
    }
    const sep = document.createElement("div");
    sep.className = "po-sep";
    popover.append(sep);
    const nw = document.createElement("div");
    nw.className = "po-new";
    const input = document.createElement("input");
    input.placeholder = "new board…";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const name = input.value.trim();
        if (name) {
          const board = { id: uid(), name };
          state.boards.push(board);
          if (!quote.boards.includes(board.id)) quote.boards.push(board.id);
          save();
          rebuild();
          renderBoards();
          input.value = "";
        }
      }
    });
    nw.append(input);
    popover.append(nw);
  }

  // position under the anchor, kept within the viewport
  const r = anchor.getBoundingClientRect();
  popover.hidden = false;
  const pw = popover.offsetWidth || 200;
  let left = window.scrollX + r.left;
  left = Math.min(left, window.scrollX + document.documentElement.clientWidth - pw - 12);
  popover.style.left = Math.max(12, left) + "px";
  popover.style.top = window.scrollY + r.bottom + 8 + "px";
  const firstInput = popover.querySelector("input");
  // don't steal focus on open unless they tab; keeps it calm
}

function toggleMembership(q, boardId) {
  const i = q.boards.indexOf(boardId);
  if (i === -1) q.boards.push(boardId);
  else q.boards.splice(i, 1);
  save();
}

function closePopover() {
  popover.hidden = true;
}
document.addEventListener("click", (e) => {
  if (popover.hidden) return;
  if (e.target.closest(".popover") || e.target.closest(".act-board")) return;
  closePopover();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePopover();
  // "/" jumps to the composer (unless you're already typing somewhere)
  if (e.key === "/" && !/^(input|textarea)$/i.test((document.activeElement || {}).tagName || "")) {
    e.preventDefault();
    quoteEl.focus();
  }
});
window.addEventListener("resize", closePopover);

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- go ----
autogrow();
render();
