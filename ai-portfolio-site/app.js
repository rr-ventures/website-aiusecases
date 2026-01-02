/* AI Use-Case Portfolio — vanilla JS, no dependencies */

const DATA = {
  BIG_WINS_URL: "./data/big_wins.json",
  TIMELINE_URL: "./data/daily_timeline.json",
};

const state = {
  bigWinsRaw: [],
  bigWins: [],
  timelineRaw: null,
  timelineDays: [], // normalized array
  derived: {
    tagCounts: new Map(),
    topTags: [],
    dateRange: { min: null, max: null },
    busiestDay: null,
    timelineCount: 0,
  },
  filters: {
    q: "",
    tags: new Set(),
    sort: "wow_desc",
  },
  ui: {
    activeTab: "wins",
    modal: { isOpen: false, winId: null, lastFocus: null },
  },
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function safeArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

function toISODate(v) {
  if (!v || typeof v !== "string") return null;
  // Expect YYYY-MM-DD; if not, best-effort.
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function dateToEpoch(iso) {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

function formatDate(iso) {
  if (!iso) return "—";
  const t = dateToEpoch(iso);
  if (!t) return iso;
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function formatDateRange(startISO, endISO) {
  const s = startISO ? formatDate(startISO) : "—";
  const e = endISO ? formatDate(endISO) : null;
  if (!e || endISO === startISO) return s;
  return `${s} → ${formatDate(endISO)}`;
}

function monthKeyFromISO(iso) {
  const m = iso?.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "unknown";
}

function monthLabelFromKey(key) {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return "Unknown month";
  const t = Date.parse(`${m[1]}-${m[2]}-01T00:00:00Z`);
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeApproach(approach) {
  if (approach == null) return [];
  if (Array.isArray(approach)) return approach.map((x) => String(x)).filter(Boolean);
  if (typeof approach === "string") {
    // Turn "bulleted-ish" strings into lines.
    const lines = approach
      .split(/\r?\n/g)
      .map((l) => l.replace(/^\s*[-*•]\s+/, "").trim())
      .filter(Boolean);
    return lines.length ? lines : [approach.trim()].filter(Boolean);
  }
  return [String(approach)];
}

function normalizeTimeline(raw) {
  // Accept either:
  // A) Array of {date, day_summary, items, source_refs?}
  // B) Map keyed by date -> {day_summary, items, source_refs?} OR string / array
  const days = [];
  if (Array.isArray(raw)) {
    for (const d of raw) {
      const date = toISODate(d?.date);
      if (!date) continue;
      const items = normalizeTimelineItems(d?.items);
      const sourceRefs = safeArray(d?.source_refs).map(String).filter(Boolean);
      days.push({
        date,
        day_summary: String(d?.day_summary ?? "").trim(),
        items,
        source_refs: sourceRefs,
      });
    }
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      const date = toISODate(k);
      if (!date) continue;
      if (typeof v === "string") {
        days.push({ date, day_summary: v, items: [], source_refs: [] });
        continue;
      }
      const items = normalizeTimelineItems(v?.items ?? v?.items_list ?? v?.entries ?? v);
      const sourceRefs = safeArray(v?.source_refs).map(String).filter(Boolean);
      days.push({
        date,
        day_summary: String(v?.day_summary ?? v?.summary ?? "").trim(),
        items,
        source_refs: sourceRefs,
      });
    }
  }

  days.sort((a, b) => (dateToEpoch(b.date) ?? 0) - (dateToEpoch(a.date) ?? 0));
  return days;
}

function normalizeTimelineItems(items) {
  // Accept array of strings or objects; fallback to string.
  const out = [];
  if (Array.isArray(items)) {
    for (const it of items) {
      if (typeof it === "string") out.push({ text: it.trim() });
      else if (it && typeof it === "object") {
        const text =
          String(it.text ?? it.item ?? it.title ?? it.summary ?? it.description ?? "").trim() ||
          JSON.stringify(it);
        out.push({ text });
      } else if (it != null) out.push({ text: String(it) });
    }
    return out.filter((x) => x.text);
  }
  if (typeof items === "string") return items.trim() ? [{ text: items.trim() }] : [];
  if (items && typeof items === "object") {
    // If the map is actually a list object, best-effort.
    const text = JSON.stringify(items);
    return text ? [{ text }] : [];
  }
  return [];
}

function computeImpressiveBullets(win) {
  // Derive from existing fields only; do not invent outcomes.
  const bullets = [];
  const tags = safeArray(win.tags).map(String).filter(Boolean);
  const refs = safeArray(win.source_refs).map(String).filter(Boolean);
  const evidence = safeArray(win.evidence_snippets).map(String).filter(Boolean);
  const approach = win._approachLines ?? [];

  if (approach.length) bullets.push(`Clear, reusable workflow (${approach.length} step${approach.length === 1 ? "" : "s"} documented).`);
  if (evidence.length) bullets.push(`Backed by evidence snippets (${evidence.length} captured).`);
  if (refs.length) bullets.push(`Traceable to source references (${refs.length} linked).`);
  if (!bullets.length && tags.length) bullets.push(`Well-scoped use-case tagged across ${tags.length} area${tags.length === 1 ? "" : "s"}.`);

  return bullets.slice(0, 3);
}

function deriveState() {
  // Big wins derived
  const tagCounts = new Map();
  let minEpoch = null;
  let maxEpoch = null;

  for (const w of state.bigWins) {
    for (const t of w.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const s = dateToEpoch(w.date_start);
    const e = dateToEpoch(w.date_end ?? w.date_start);
    if (s != null) minEpoch = minEpoch == null ? s : Math.min(minEpoch, s);
    if (e != null) maxEpoch = maxEpoch == null ? e : Math.max(maxEpoch, e);
  }

  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([tag, count]) => ({ tag, count }));

  // Timeline derived
  const busiest = state.timelineDays
    .map((d) => ({ date: d.date, count: d.items.length, summary: d.day_summary }))
    .sort((a, b) => b.count - a.count || (dateToEpoch(b.date) ?? 0) - (dateToEpoch(a.date) ?? 0))[0];

  state.derived.tagCounts = tagCounts;
  state.derived.topTags = topTags;
  state.derived.dateRange = {
    min: minEpoch != null ? new Date(minEpoch).toISOString().slice(0, 10) : null,
    max: maxEpoch != null ? new Date(maxEpoch).toISOString().slice(0, 10) : null,
  };
  state.derived.busiestDay = busiest?.count ? busiest : null;
  state.derived.timelineCount = state.timelineDays.length;
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

function showFetchError(err) {
  const host = $("#errorHost");
  host.innerHTML = "";

  const card = document.createElement("div");
  card.className = "error-card";
  card.innerHTML = `
    <h3>Couldn’t load JSON data</h3>
    <p class="muted">
      This page loads <code>/data/*.json</code> via <code>fetch()</code>, which requires a local server.
      If you opened the file directly (<code>file://</code>), the browser will block requests.
    </p>
    <div class="cmd">python -m http.server 8000</div>
    <p class="muted">Then open <code>http://localhost:8000/ai-portfolio-site/</code></p>
    <p class="muted"><strong>Details:</strong> ${escapeHTML(err?.message ?? String(err))}</p>
  `;
  host.appendChild(card);
}

async function loadData() {
  const [wins, timeline] = await Promise.all([fetchJSON(DATA.BIG_WINS_URL), fetchJSON(DATA.TIMELINE_URL)]);
  state.bigWinsRaw = wins;
  state.timelineRaw = timeline;

  state.bigWins = normalizeBigWins(wins);
  state.timelineDays = normalizeTimeline(timeline);
  deriveState();
}

function normalizeBigWins(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;

  for (const w of raw) {
    const id = String(w?.id ?? "").trim() || `win_${out.length + 1}`;
    const title = String(w?.title ?? "Untitled win").trim();
    const date_start = toISODate(w?.date_start) ?? toISODate(w?.date) ?? null;
    const date_end = toISODate(w?.date_end) ?? null;
    const tags = safeArray(w?.tags).map(String).map((s) => s.trim()).filter(Boolean);
    const source_refs = safeArray(w?.source_refs).map(String).map((s) => s.trim()).filter(Boolean);
    const wow_score = clamp(Number(w?.wow_score ?? 0) || 0, 0, 10);
    const problem = String(w?.problem ?? "").trim();
    const approachLines = normalizeApproach(w?.approach);
    const evidence_snippets = safeArray(w?.evidence_snippets).map(String).map((s) => s.trim()).filter(Boolean);
    const prompt_template = String(w?.prompt_template ?? "").trim();
    const short_script = String(w?.short_script ?? "").trim();
    const redactions_applied = Boolean(w?.redactions_applied);

    out.push({
      id,
      title,
      date_start,
      date_end,
      tags,
      source_refs,
      wow_score,
      problem,
      approach: w?.approach ?? "",
      _approachLines: approachLines,
      evidence_snippets,
      prompt_template,
      short_script,
      redactions_applied,
      _search: [title, problem, tags.join(" ")].join(" · ").toLowerCase(),
      _dateEpoch: dateToEpoch(date_start) ?? 0,
    });
  }
  return out;
}

function renderStats() {
  $("#statTotalWins").textContent = String(state.bigWins.length);
  $("#winsCountBadge").textContent = String(state.bigWins.length);
  $("#timelineCountBadge").textContent = String(state.derived.timelineCount);

  const min = state.derived.dateRange.min;
  const max = state.derived.dateRange.max;
  $("#statDateRange").textContent = min && max ? `${formatDate(min)} → ${formatDate(max)}` : "—";

  const busiest = state.derived.busiestDay;
  $("#statBusiestDay").textContent = busiest ? `${formatDate(busiest.date)} (${busiest.count})` : "—";

  const topTags = state.derived.topTags;
  $("#statTopTags").textContent = topTags.length ? topTags.map((t) => `${t.tag} (${t.count})`).join(", ") : "—";
}

function setActiveTab(tab) {
  state.ui.activeTab = tab;
  $$(".tab").forEach((b) => {
    const is = b.dataset.tab === tab;
    b.classList.toggle("is-active", is);
    b.setAttribute("aria-selected", is ? "true" : "false");
  });
  $$(".panel").forEach((p) => p.classList.toggle("is-visible", p.dataset.panel === tab));
}

function renderTagChips() {
  const host = $("#tagChips");
  host.innerHTML = "";

  const entries = Array.from(state.derived.tagCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 18);

  for (const [tag, count] of entries) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.tag = tag;
    btn.innerHTML = `${escapeHTML(tag)} <span class="chip-count">${count}</span>`;
    if (state.filters.tags.has(tag)) btn.classList.add("is-active");
    btn.addEventListener("click", () => {
      if (state.filters.tags.has(tag)) state.filters.tags.delete(tag);
      else state.filters.tags.add(tag);
      renderTagChips();
      renderBigWins();
    });
    host.appendChild(btn);
  }
}

function getFilteredWins() {
  const q = state.filters.q.trim().toLowerCase();
  const requiredTags = state.filters.tags;

  let list = state.bigWins.slice();
  if (q) list = list.filter((w) => w._search.includes(q));
  if (requiredTags.size) {
    list = list.filter((w) => {
      const s = new Set(w.tags);
      for (const t of requiredTags) if (!s.has(t)) return false;
      return true;
    });
  }

  switch (state.filters.sort) {
    case "newest":
      list.sort((a, b) => (b._dateEpoch ?? 0) - (a._dateEpoch ?? 0));
      break;
    case "oldest":
      list.sort((a, b) => (a._dateEpoch ?? 0) - (b._dateEpoch ?? 0));
      break;
    case "wow_desc":
    default:
      list.sort((a, b) => (b.wow_score ?? 0) - (a.wow_score ?? 0) || (b._dateEpoch ?? 0) - (a._dateEpoch ?? 0));
      break;
  }

  return list;
}

function renderBigWins() {
  const host = $("#winsGrid");
  const list = getFilteredWins();
  host.innerHTML = "";

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No wins match your filters. Try clearing tags or search.";
    host.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const w of list) frag.appendChild(renderWinCard(w));
  host.appendChild(frag);
}

function renderWinCard(w) {
  const el = document.createElement("article");
  el.className = "card win-card";
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `Open details for ${w.title}`);
  el.dataset.winId = w.id;

  const wowPct = Math.round((clamp(w.wow_score, 0, 10) / 10) * 100);
  const teaser = (w.problem || "").trim() || "—";

  el.innerHTML = `
    <div class="win-top">
      <div class="win-left">
        <h3 class="win-title">${escapeHTML(w.title)}</h3>
        <div class="win-dates">${escapeHTML(formatDateRange(w.date_start, w.date_end))}</div>
      </div>
      <div class="wow" aria-label="Wow score">
        <div class="wow-badge">WOW ${w.wow_score.toFixed(1)}</div>
        <div class="wow-bar" aria-hidden="true"><span style="width:${wowPct}%"></span></div>
      </div>
    </div>
    <div class="tag-list">
      ${w.tags.slice(0, 6).map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join("")}
    </div>
    <div class="teaser">${escapeHTML(teaser)}</div>
  `;

  const open = () => openWinModal(w.id);
  el.addEventListener("click", open);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
  return el;
}

function pillForWow(score) {
  if (score >= 8) return `<span class="pill pill--good">WOW ${score.toFixed(1)}</span>`;
  if (score >= 5) return `<span class="pill pill--warn">WOW ${score.toFixed(1)}</span>`;
  return `<span class="pill pill--bad">WOW ${score.toFixed(1)}</span>`;
}

function openWinModal(winId) {
  const win = state.bigWins.find((w) => w.id === winId);
  if (!win) return;

  state.ui.modal.isOpen = true;
  state.ui.modal.winId = winId;
  state.ui.modal.lastFocus = document.activeElement;

  const overlay = $("#modalOverlay");
  const titleEl = $("#modalTitle");
  const metaEl = $("#modalMeta");
  const bodyEl = $("#modalBody");

  titleEl.textContent = win.title;
  metaEl.textContent = `${formatDateRange(win.date_start, win.date_end)} • ${win.tags.slice(0, 6).join(" • ") || "No tags"}`;

  const impressive = computeImpressiveBullets(win);
  const approachLines = win._approachLines ?? [];
  const evidence = win.evidence_snippets ?? [];
  const refs = win.source_refs ?? [];

  const redactionPill = win.redactions_applied
    ? `<span class="pill pill--good">Redactions applied</span>`
    : `<span class="pill pill--warn">Redactions unknown</span>`;

  bodyEl.innerHTML = `
    <div class="detail-grid">
      <div class="detail-card">
        <h3>Human problem</h3>
        <p>${escapeHTML(win.problem || "—")}</p>
      </div>
      <div class="detail-card">
        <h3>At a glance</h3>
        <div class="kv">
          <div class="kv-row">
            <div class="kv-key">Wow</div>
            <div class="kv-val">${pillForWow(win.wow_score)} <span style="margin-left:10px;">${redactionPill}</span></div>
          </div>
          <div class="kv-row">
            <div class="kv-key">Tags</div>
            <div class="kv-val">${win.tags.length ? win.tags.map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join(" ") : "—"}</div>
          </div>
          <div class="kv-row">
            <div class="kv-key">Evidence</div>
            <div class="kv-val">${evidence.length ? `${evidence.length} snippet${evidence.length === 1 ? "" : "s"}` : "—"}</div>
          </div>
        </div>
      </div>

      <div class="detail-card">
        <h3>What I did (approach)</h3>
        ${approachLines.length ? `<ul>${approachLines.map((l) => `<li>${escapeHTML(l)}</li>`).join("")}</ul>` : `<p>—</p>`}
      </div>

      <div class="detail-card">
        <h3>Why this is impressive (derived)</h3>
        ${impressive.length ? `<ul>${impressive.map((b) => `<li>${escapeHTML(b)}</li>`).join("")}</ul>` : `<p>—</p>`}
      </div>

      <div class="detail-card" style="grid-column:1/-1;">
        <h3>Evidence snippets</h3>
        ${evidence.length ? `<ul>${evidence.map((e) => `<li>${escapeHTML(e)}</li>`).join("")}</ul>` : `<p>—</p>`}
      </div>

      <div class="detail-card">
        <h3>Reusable prompt template</h3>
        <div class="copy-row">
          <button class="btn btn--primary" type="button" data-copy="prompt">Copy</button>
          <span class="muted" style="margin:0;">Paste into your LLM of choice.</span>
        </div>
        <div class="pre" id="promptBlock">${escapeHTML(win.prompt_template || "—")}</div>
      </div>

      <div class="detail-card">
        <h3>20-second script</h3>
        <div class="copy-row">
          <button class="btn btn--primary" type="button" data-copy="script">Copy</button>
          <span class="muted" style="margin:0;">Useful for intros/demos.</span>
        </div>
        <div class="pre" id="scriptBlock">${escapeHTML(win.short_script || "—")}</div>
      </div>

      <div class="detail-card" style="grid-column:1/-1;">
        <details>
          <summary>Source refs (${refs.length})</summary>
          ${refs.length ? `<div class="sources">${refs.map((r) => `<span class="source">${escapeHTML(r)}</span>`).join("")}</div>` : `<p class="muted">—</p>`}
        </details>
      </div>
    </div>
  `;

  // Wire copy buttons
  $$("[data-copy]", bodyEl).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const kind = btn.getAttribute("data-copy");
      const text = kind === "prompt" ? win.prompt_template : win.short_script;
      if (!text) {
        toast("Nothing to copy.");
        return;
      }
      const ok = await copyToClipboard(text);
      toast(ok ? "Copied!" : "Copy failed — select and copy manually.");
    });
  });

  overlay.hidden = false;
  document.body.style.overflow = "hidden";

  // focus close button for accessibility
  requestAnimationFrame(() => $("#modalClose").focus());
}

function closeModal() {
  const overlay = $("#modalOverlay");
  if (overlay.hidden) return;
  overlay.hidden = true;
  document.body.style.overflow = "";
  state.ui.modal.isOpen = false;

  const last = state.ui.modal.lastFocus;
  state.ui.modal.lastFocus = null;
  if (last && typeof last.focus === "function") last.focus();
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

function toast(message) {
  const host = $("#toastHost");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    el.style.transition = "opacity 180ms ease, transform 180ms ease";
    setTimeout(() => el.remove(), 220);
  }, 1600);
}

function renderTimeline() {
  const host = $("#timelineHost");
  host.innerHTML = "";

  const days = state.timelineDays.slice().sort((a, b) => (dateToEpoch(b.date) ?? 0) - (dateToEpoch(a.date) ?? 0));
  if (!days.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No timeline entries found.";
    host.appendChild(empty);
    $("#monthJump").innerHTML = "";
    $("#busiestDays").innerHTML = "";
    $("#heatStrip").innerHTML = "";
    return;
  }

  // group by month
  const groups = new Map();
  for (const d of days) {
    const key = monthKeyFromISO(d.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  const monthKeys = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : -1));
  renderMonthJump(monthKeys);
  renderBusiestDays(days);
  renderHeatStrip(days);

  const frag = document.createDocumentFragment();
  for (const key of monthKeys) {
    const monthEl = document.createElement("section");
    monthEl.className = "month";
    monthEl.id = `m_${key}`;

    const monthDays = groups.get(key);
    const totalItems = monthDays.reduce((acc, d) => acc + d.items.length, 0);
    monthEl.innerHTML = `
      <div class="month-header">
        <h3 class="month-title">${escapeHTML(monthLabelFromKey(key))}</h3>
        <div class="month-meta">${monthDays.length} day${monthDays.length === 1 ? "" : "s"} • ${totalItems} item${totalItems === 1 ? "" : "s"}</div>
      </div>
    `;

    for (const d of monthDays) monthEl.appendChild(renderDayRow(d));
    frag.appendChild(monthEl);
  }

  host.appendChild(frag);
}

function renderMonthJump(keys) {
  const sel = $("#monthJump");
  sel.innerHTML = "";
  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = `m_${k}`;
    opt.textContent = monthLabelFromKey(k);
    sel.appendChild(opt);
  }
  sel.onchange = () => {
    const id = sel.value;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

function renderBusiestDays(days) {
  const list = $("#busiestDays");
  list.innerHTML = "";
  const top = days
    .map((d) => ({ date: d.date, count: d.items.length, summary: d.day_summary }))
    .sort((a, b) => b.count - a.count || (dateToEpoch(b.date) ?? 0) - (dateToEpoch(a.date) ?? 0))
    .slice(0, 5);

  for (const d of top) {
    const li = document.createElement("li");
    li.innerHTML = `${escapeHTML(formatDate(d.date))} — ${escapeHTML(d.summary || "—")} <span class="badge">${d.count}</span>`;
    list.appendChild(li);
  }
}

function renderHeatStrip(days) {
  // Show last ~120 days of activity volume as tiny squares (newest on left).
  const host = $("#heatStrip");
  host.innerHTML = "";

  const sortedAsc = days.slice().sort((a, b) => (dateToEpoch(a.date) ?? 0) - (dateToEpoch(b.date) ?? 0));
  const last = sortedAsc.slice(-120);
  const maxCount = Math.max(1, ...last.map((d) => d.items.length));

  const frag = document.createDocumentFragment();
  for (const d of last) {
    const ratio = d.items.length / maxCount;
    const intensity = clamp(Math.ceil(ratio * 5), 0, 5);
    const cell = document.createElement("span");
    cell.className = "heat-cell";
    cell.dataset.i = String(intensity);
    cell.title = `${d.date}: ${d.items.length} item${d.items.length === 1 ? "" : "s"}`;
    frag.appendChild(cell);
  }
  host.appendChild(frag);

  const label = document.createElement("div");
  label.className = "heat-label";
  label.textContent = `Last ${last.length} days`;
  host.appendChild(label);
}

function renderDayRow(day) {
  const details = document.createElement("details");
  details.className = "day";

  const count = day.items.length;
  const summary = day.day_summary || "—";
  details.innerHTML = `
    <summary>
      <div class="day-left">
        <div class="day-date">${escapeHTML(formatDate(day.date))}</div>
        <div class="day-summary">${escapeHTML(summary)}</div>
      </div>
      <div class="day-right">
        <span class="badge" aria-label="Activity count">${count}</span>
        <span class="chev" aria-hidden="true">›</span>
      </div>
    </summary>
    <div class="day-body">
      ${count ? `<ol class="items">${day.items.map((it) => `<li>${escapeHTML(it.text)}</li>`).join("")}</ol>` : `<div class="muted">No items.</div>`}
      ${day.source_refs?.length ? `<div class="sources">${day.source_refs.map((r) => `<span class="source">${escapeHTML(r)}</span>`).join("")}</div>` : ``}
    </div>
  `;
  return details;
}

function setupTheme() {
  const key = "ai_portfolio_theme";
  const saved = localStorage.getItem(key);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const initial = saved === "light" || saved === "dark" ? saved : prefersDark ? "dark" : "light";
  setTheme(initial);

  $("#themeToggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(key, next);
    toast(next === "dark" ? "Dark mode" : "Light mode");
  });
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function setupTabs() {
  $$(".tab").forEach((b) => {
    b.addEventListener("click", () => setActiveTab(b.dataset.tab));
  });
}

function setupWinsControls() {
  $("#winsSearch").addEventListener("input", (e) => {
    state.filters.q = e.target.value ?? "";
    renderBigWins();
  });
  $("#winsSort").addEventListener("change", (e) => {
    state.filters.sort = e.target.value;
    renderBigWins();
  });
  $("#clearFilters").addEventListener("click", () => {
    state.filters.q = "";
    state.filters.tags.clear();
    state.filters.sort = "wow_desc";
    $("#winsSearch").value = "";
    $("#winsSort").value = "wow_desc";
    renderTagChips();
    renderBigWins();
    toast("Cleared.");
  });
}

function setupModal() {
  $("#modalClose").addEventListener("click", closeModal);
  $("#modalOverlay").addEventListener("click", (e) => {
    if (e.target === $("#modalOverlay")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // Focus trap while modal is open (keeps keyboard navigation inside dialog).
  document.addEventListener("keydown", (e) => {
    if (!state.ui.modal.isOpen) return;
    if (e.key !== "Tab") return;
    const overlay = $("#modalOverlay");
    if (overlay.hidden) return;
    const modal = overlay.querySelector(".modal");
    const focusables = getFocusable(modal);
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !modal.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

function getFocusable(root) {
  if (!root) return [];
  const sel =
    'button, [href], input, select, textarea, details > summary, [tabindex]:not([tabindex="-1"])';
  return $$(sel, root).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
}

async function main() {
  setupTheme();
  setupTabs();
  setupWinsControls();
  setupModal();

  try {
    await loadData();
  } catch (err) {
    showFetchError(err);
    // Still render empty shells.
    renderStats();
    return;
  }

  renderStats();
  renderTagChips();
  renderBigWins();
  renderTimeline();
}

main();


