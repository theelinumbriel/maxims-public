// maxims -- a local, account-free sandbox for collecting words.
// state lives in localStorage; no network, no backend.

const KEY = "maxims.v1";

/** @typedef {{id:string,text:string,author:string,boards:string[],createdAt:number}} Quote */
/** @typedef {{id:string,name:string}} Board */

const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) || "id-" + Math.random().toString(36).slice(2);

/** @type {{quotes:Quote[],boards:Board[]}} */
let state = load();
let active = "all"; // "all" | boardId
let dragId = null; // id of the maxim currently being dragged onto a board

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // first run: a blank page -- you arrive and start typing
  return { quotes: [], boards: [] };
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
    // a real board (not "all") accepts a maxim dragged onto it: the maxim
    // joins this board and still lives in "all".
    if (id !== "all") {
      b.addEventListener("dragover", (e) => {
        if (!dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        b.classList.add("drop-target");
      });
      b.addEventListener("dragleave", () => b.classList.remove("drop-target"));
      b.addEventListener("drop", (e) => {
        e.preventDefault();
        b.classList.remove("drop-target");
        const q = state.quotes.find((x) => x.id === dragId);
        dragId = null;
        if (!q) return;
        if (!q.boards.includes(id)) {
          q.boards.push(id);
          save();
        }
        render();
      });
    }
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

// responsive column count for the masonry
function colCount() {
  const w = wall.clientWidth || window.innerWidth || 1040;
  if (w < 560) return 1;
  if (w < 900) return 2;
  return 3;
}

function renderWall(enterId) {
  wall.innerHTML = "";
  const items = visibleQuotes();
  if (items.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent =
      active === "all"
        ? "nothing yet -- keep your first maxim above."
        : "this board is empty. keep something here, or save an existing maxim to it.";
    wall.append(p);
    return;
  }
  // explicit equal columns (flex), so every column starts at the same top Y;
  // cards fill round-robin across the top row, then down.
  const n = colCount();
  const cols = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div");
    c.className = "col";
    wall.append(c);
    cols.push(c);
  }
  let enterNode = null;
  items.forEach((q, i) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = q.id;
    const qEl = node.querySelector(".q");
    if (enterId && q.id === enterId) {
      // split into words so each can be revealed in turn; pre-hide
      // synchronously so there's no flash before the animation runs.
      fillWords(qEl, q.text);
      node.style.opacity = "0";
      qEl.querySelectorAll(".w").forEach((s) => (s.style.opacity = "0"));
      enterNode = node;
    } else {
      qEl.textContent = q.text;
    }
    node.querySelector(".author").textContent = q.author || "";
    cols[i % n].append(node);
  });
  if (enterNode) enhanceEnter(enterNode);
}

// break text into inline-block word spans (whitespace kept as text nodes so
// the line still wraps naturally between words)
function fillWords(el, text) {
  el.textContent = "";
  for (const chunk of text.split(/(\s+)/)) {
    if (!chunk) continue;
    if (/^\s+$/.test(chunk)) {
      el.append(document.createTextNode(chunk));
    } else {
      const s = document.createElement("span");
      s.className = "w";
      s.textContent = chunk;
      el.append(s);
    }
  }
}

const reduceMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Motion One (motion.dev) -- a tiny spring/stagger engine, loaded lazily from a
// CDN. If it can't load we fall back to the plain CSS roll, so the page never
// depends on it.
let _motion;
function loadMotion() {
  if (_motion === undefined) {
    _motion = import("https://esm.sh/motion@11").catch(() => null);
  }
  return _motion;
}

function clearReveal(card) {
  card.style.opacity = "";
  card.querySelectorAll(".q .w").forEach((s) => (s.style.opacity = ""));
}

// the signature: a freshly kept maxim settles onto the page while its words
// rise out of a soft blur, one after another, like ink finding the paper.
async function enhanceEnter(card) {
  if (reduceMotion()) return clearReveal(card);
  const m = await loadMotion();
  if (!m || !m.animate) {
    clearReveal(card);
    card.classList.add("enter");
    return;
  }
  const { animate, stagger } = m;
  const words = card.querySelectorAll(".q .w");
  const author = card.querySelector(".author");

  animate(
    card,
    { opacity: [0, 1], y: [10, 0], scale: [0.992, 1] },
    { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
  );
  animate(
    words,
    { opacity: [0, 1], y: [9, 0], filter: ["blur(7px)", "blur(0px)"] },
    { delay: stagger(0.035), type: "spring", stiffness: 380, damping: 30 }
  );
  if (author && author.textContent) {
    animate(
      author,
      { opacity: [0, 1], y: [4, 0] },
      { duration: 0.5, delay: 0.12 + words.length * 0.035, ease: [0.22, 1, 0.36, 1] }
    );
  }
}

function render(enterId) {
  renderBoards();
  renderWall(enterId);
}

// ---- drag a maxim onto a board ----
wall.addEventListener("dragstart", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  dragId = card.dataset.id;
  card.classList.add("dragging");
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", dragId);
  }
});
wall.addEventListener("dragend", (e) => {
  e.target.closest(".card")?.classList.remove("dragging");
  dragId = null;
  document.querySelectorAll(".tab.drop-target").forEach((t) => t.classList.remove("drop-target"));
});

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
    const text = q.author ? `${q.text}\n${q.author}` : q.text;
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
      hint.textContent = "no boards yet -- make one:";
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

// re-flow the columns when the responsive column count changes
let _cols = colCount();
window.addEventListener("resize", () => {
  const n = colCount();
  if (n !== _cols) {
    _cols = n;
    renderWall();
  }
});

// ---- go ----
loadMotion(); // warm the animation engine so the first "keep" is already smooth
autogrow();
render();
