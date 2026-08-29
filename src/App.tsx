import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDecks,
  getDeckStats,
  getAllCardsWithState,
  getDueCards,
  createCard,
  updateCard,
  deleteCard,
  updateCardState,
  logReview,
  bulkCreateCards,
  clearAllCards,
  deduplicateCards,
  initDb,
  exportAllCards,
} from "./lib/db";
import { nextState } from "./lib/srs";
import type { CardWithState, Deck, DeckStats, Grade } from "./lib/types";
import { MarkdownView, extractUrls } from "./lib/markdown";
import { parseCsv, toCsv } from "./lib/csv";
import { SEED_CARDS, BLIND75_SEED } from "./lib/seed";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type View = "today" | "review" | "browse" | "settings";

const DECK_COLORS: Record<string, string> = {
  "DSA / LeetCode": "#0ea5e9",
  "System Design Concepts": "#8b5cf6",
  "System Design Use Cases": "#f59e0b",
  "AI Concepts": "#10b981",
  "AI Use Cases": "#ec4899",
  Behavioral: "#6366f1",
};

function deckColor(name: string) {
  return DECK_COLORS[name] ?? "#64748b";
}
function tagColor(tag: string) {
  if (tag.includes("dsa")) return "#0ea5e9";
  if (tag.includes("sd")) return "#8b5cf6";
  if (tag.includes("ai")) return "#10b981";
  if (tag.includes("behavioral")) return "#6366f1";
  if (tag.includes("medium")) return "#f59e0b";
  if (tag.includes("hard")) return "#dc2626";
  if (tag.includes("easy")) return "#10b981";
  return "#64748b";
}

export default function App() {
  const [view, setView] = useState<View>("today");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [stats, setStats] = useState<DeckStats[]>([]);
  const [allCards, setAllCards] = useState<CardWithState[]>([]);
  const [dueQueue, setDueQueue] = useState<CardWithState[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<CardWithState | null>(null);
  const [viewingCard, setViewingCard] = useState<CardWithState | null>(null);
  const [form, setForm] = useState({ deckId: 0, front: "", back: "", tags: "" });
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [isTauriEnv, setIsTauriEnv] = useState(false);
  const [showDestructive, setShowDestructive] = useState(() => {
    try {
      return localStorage.getItem("revision_showDestructive") === "true";
    } catch {
      return false;
    }
  });
  const [articleUrl, setArticleUrl] = useState("");
  const [isOrganizing, setIsOrganizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentCard = dueQueue[reviewIdx] ?? null;
  const progress = dueQueue.length ? `${reviewIdx + 1} / ${dueQueue.length}` : "";

  async function refresh() {
    const [d, s, a] = await Promise.all([getDecks(), getDeckStats(), getAllCardsWithState()]);
    setDecks(d);
    setStats(s);
    setAllCards(a);
    if (form.deckId === 0 && d[0]) setForm((f) => ({ ...f, deckId: d[0].id }));
  }

  async function refreshQueue() {
    const q = await getDueCards(20);
    setDueQueue(q);
    setReviewIdx(0);
    setShowAnswer(false);
  }

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await refresh();
        await refreshQueue();
        // Detect Tauri env and load autostart + check for updates
        const tauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
        setIsTauriEnv(tauri);
        if (tauri) {
          try {
            const { isEnabled } = await import("@tauri-apps/plugin-autostart");
            setAutostartEnabled(await isEnabled());
          } catch {}
        }
      } catch (e) {
        console.error(e);
        setToast(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    try {
      localStorage.setItem("revision_showDestructive", String(showDestructive));
    } catch {}
  }, [showDestructive]);

  const dueTotal = stats.reduce((a, s) => a + s.due, 0);
  const newTotal = stats.reduce((a, s) => a + s.newCount, 0);
  const totalCards = stats.reduce((a, s) => a + s.total, 0);
  const hasBlind75 = useMemo(() => allCards.some((c) => c.tags.includes("blind75")), [allCards]);
  const duplicateCount = useMemo(() => {
    const seen = new Set<string>();
    let dup = 0;
    for (const c of allCards) {
      const k = `${c.deck_id}::${c.front.trim()}`;
      if (seen.has(k)) dup++;
      else seen.add(k);
    }
    return dup;
  }, [allCards]);
  const allTags = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of allCards) {
      for (const t of c.tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        map.set(t, (map.get(t) || 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [allCards]);
  const tagStats = useMemo(() => {
    const now = new Date();
    return allTags.slice(0, 6).map(([tag]) => {
      const forTag = allCards.filter((c) => c.tags.toLowerCase().split(",").map((t) => t.trim()).includes(tag));
      const due = forTag.filter((c) => c.state !== "new" && new Date(c.due_at) <= now).length;
      return { tag, total: forTag.length, due };
    });
  }, [allTags, allCards]);
  const singleDeckId = decks.length === 1 ? decks[0]?.id ?? 0 : 0;

  // Sync tray with due/new counts — single deck: show per-tag breakdown
  useEffect(() => {
    if (!isTauriEnv || stats.length === 0) return;
    const due = stats.reduce((a, s) => a + s.due, 0);
    const newCount = stats.reduce((a, s) => a + s.newCount, 0);
    const total = stats.reduce((a, s) => a + s.total, 0);
    const decks = stats.length === 1 && tagStats.length > 0
      ? tagStats.map((t) => ({ name: t.tag, due: t.due, total: t.total }))
      : stats.map((s) => ({ name: s.deck_name, due: s.due, total: s.total }));
    invoke("update_tray", { due, new: newCount, total, decks }).catch(() => {});
  }, [stats, tagStats, isTauriEnv]);

  // Listen for tray Review action
  useEffect(() => {
    if (!isTauriEnv) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("tray-review", () => {
          refreshQueue();
          setView("review");
        });
      } catch {}
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [isTauriEnv]);

  // Keyboard shortcuts for review
  useEffect(() => {
    if (view !== "review" || !currentCard) return;
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space" && !showAnswer) {
        e.preventDefault();
        setShowAnswer(true);
      } else if (showAnswer && e.key === "1") grade(1);
      else if (showAnswer && (e.key === "2" || e.key === " ")) grade(3);
      else if (showAnswer && e.key === "3") grade(4);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [view, currentCard, showAnswer, reviewIdx, dueQueue]);

  async function grade(g: Grade) {
    if (!currentCard) return;
    const now = new Date();
    const state = {
      card_id: currentCard.id,
      due_at: currentCard.due_at,
      interval: currentCard.interval,
      ease: currentCard.ease,
      reps: currentCard.reps,
      state: currentCard.state as CardWithState["state"],
      updated_at: now.toISOString(),
    };
    const next = nextState(state, g, now);
    await updateCardState(next);
    await logReview(currentCard.id, g);
    // Move to next
    if (reviewIdx + 1 >= dueQueue.length) {
      setToast(g === 1 ? "Scheduled for 10m" : g === 3 ? "Good — next review tomorrow" : "Easy — in 3 days");
      await refresh();
      await refreshQueue();
      if (dueQueue.length <= 1) {
        setView("today");
      }
    } else {
      setReviewIdx((i) => i + 1);
      setShowAnswer(false);
    }
    // Refresh stats in background
    getDeckStats().then(setStats);
  }

  const filteredBrowse = useMemo(() => {
    let rows = allCards;
    if (tagFilter) rows = rows.filter((c) => c.tags.toLowerCase().split(",").map((t) => t.trim()).includes(tagFilter.toLowerCase()));
    if (stateFilter) rows = rows.filter((c) => c.state === stateFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (c) =>
          c.front.toLowerCase().includes(q) ||
          c.back.toLowerCase().includes(q) ||
          c.tags.toLowerCase().includes(q) ||
          (c.deck_name ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [allCards, tagFilter, stateFilter, search]);

  async function handleAddOrUpdate() {
    if (!form.front.trim() || !form.back.trim()) {
      setToast("Front and Back required");
      return;
    }
    const targetDeckId = singleDeckId || form.deckId || decks[0]?.id || 0;
    if (editing) {
      await updateCard(editing.id, targetDeckId, form.front, form.back, form.tags);
      setToast("Card updated");
    } else {
      await createCard(targetDeckId, form.front, form.back, form.tags);
      setToast("Card added");
    }
    setShowAdd(false);
    setEditing(null);
    setArticleUrl("");
    setForm({ deckId: singleDeckId || decks[0]?.id || 0, front: "", back: "", tags: "" });
    await refresh();
    await refreshQueue();
  }

  async function handleOrganizeArticle() {
    const url = articleUrl.trim() || extractUrls(form.back)[0] || extractUrls(form.front)[0] || "";
    if (!url || !url.startsWith("http")) {
      setToast("Paste a valid https:// article URL first");
      return;
    }
    setIsOrganizing(true);
    try {
      const { organizeArticle } = await import("./lib/article");
      const organized = await organizeArticle(url);
      setForm((f) => ({
        deckId: singleDeckId || f.deckId || decks[0]?.id || 0,
        front: organized.front,
        back: organized.back,
        tags: organized.tags,
      }));
      setToast("Organized via Zen • edit then Add");
    } catch (e) {
      setToast(String(e).slice(0, 120));
    } finally {
      setIsOrganizing(false);
    }
  }

  function openEdit(c: CardWithState) {
    setEditing(c);
    setForm({ deckId: singleDeckId || c.deck_id, front: c.front, back: c.back, tags: c.tags });
    setArticleUrl(extractUrls(c.back)[0] || extractUrls(c.front)[0] || "");
    setShowAdd(true);
  }

  async function handleDelete(c: CardWithState) {
    if (!confirm(`Delete card?\n\n${c.front.slice(0, 120)}`)) return;
    await deleteCard(c.id);
    setToast("Deleted");
    await refresh();
    await refreshQueue();
  }

  async function handleExport() {
    const rows = await exportAllCards();
    const csv = toCsv(rows.map((r) => ({ deck: r.deck_name ?? "", front: r.front, back: r.back, tags: r.tags })));
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prep-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast(`Exported ${rows.length} cards`);
  }

  async function handleImportFile(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);
    // Map deck names: if empty or not found, use first deck or create
    const rows = parsed.map((p) => {
      let deckName = p.deck.trim();
      if (!deckName) deckName = decks[0]?.name ?? "DSA / LeetCode";
      // Fuzzy: if deck not found, use closest by includes
      const found = decks.find((d) => d.name.toLowerCase() === deckName.toLowerCase());
      if (!found) {
        const alt = decks.find((d) => d.name.toLowerCase().includes(deckName.toLowerCase().slice(0, 4)));
        if (alt) deckName = alt.name;
        else deckName = decks[0]?.name ?? deckName;
      } else deckName = found.name;
      return { deckName, front: p.front, back: p.back, tags: p.tags };
    });
    if (rows.length === 0) {
      setToast("No valid rows found. Need columns: deck,front,back,tags");
      return;
    }
    const n = await bulkCreateCards(rows);
    setToast(`Imported ${n} / ${rows.length} cards`);
    await refresh();
    await refreshQueue();
  }

  async function handleSeed() {
    const n = await bulkCreateCards(SEED_CARDS.map((c) => ({ deckName: c.deck, front: c.front, back: c.back, tags: c.tags })));
    setToast(`Seeded ${n} starter cards`);
    await refresh();
    await refreshQueue();
  }

  async function handleSeedBlind75() {
    const existing = new Set(allCards.map((c) => c.front));
    const toCreate = BLIND75_SEED.filter((c) => !existing.has(c.front)).map((c) => ({ deckName: c.deck, front: c.front, back: c.back, tags: c.tags }));
    if (toCreate.length === 0) {
      setToast("Blind 75 already seeded");
      return;
    }
    const n = await bulkCreateCards(toCreate);
    setToast(`Seeded ${n} Blind 75 cards — now ${totalCards + n} total`);
    await refresh();
    await refreshQueue();
  }

  async function handleResetDb() {
    if (!confirm(`Reset everything? This will delete ALL ${totalCards} cards and cannot be undone.\n\nYou can then re-seed Blind 75 cleanly to 75 or 88 total.`)) return;
    if (!confirm(`Are you sure? This deletes ${totalCards} cards permanently.`)) return;
    await clearAllCards();
    setToast("Reset — all cards deleted");
    await refresh();
    await refreshQueue();
  }

  async function handleDeduplicate() {
    const removed = await deduplicateCards();
    if (removed === 0) setToast("No duplicates found");
    else setToast(`Removed ${removed} duplicate cards`);
    await refresh();
    await refreshQueue();
  }

  async function toggleAutostart() {
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (autostartEnabled) {
        await disable();
        setAutostartEnabled(false);
        setToast("Autostart disabled");
      } else {
        await enable();
        setAutostartEnabled(true);
        setToast("Will launch at login");
      }
    } catch (e) {
      setToast(String(e));
    }
  }

  function toggleWidget() {
    invoke("toggle_widget").catch((e) => setToast(String(e)));
  }

  function openExternal(url: string) {
    const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
    if (isTauri) {
      import("@tauri-apps/plugin-opener")
        .then(({ openUrl }) => openUrl(url))
        .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function gradeViewing(grade: Grade) {
    if (!viewingCard) return;
    const now = new Date();
    const state = {
      card_id: viewingCard.id,
      due_at: viewingCard.due_at,
      interval: viewingCard.interval,
      ease: viewingCard.ease,
      reps: viewingCard.reps,
      state: viewingCard.state as CardWithState["state"],
      updated_at: now.toISOString(),
    };
    const next = nextState(state, grade, now);
    await updateCardState(next);
    await logReview(viewingCard.id, grade);
    setToast(grade === 1 ? "Scheduled for 10m" : grade === 3 ? "Good — next review tomorrow" : "Easy — in 3 days");
    setViewingCard(null);
    await refresh();
    await refreshQueue();
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Opening revision.db…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="mobile-topbar">
        <div className="brand">
          <div className="brand-mark">◈</div>
          <div className="brand-title">Revision</div>
        </div>
        <div className="mobile-nav">
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}>Today</button>
          <button className={view === "review" ? "active" : ""} onClick={() => { refreshQueue(); setView("review"); }}>Review</button>
          <button className={view === "browse" ? "active" : ""} onClick={() => setView("browse")}>Browse</button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>Settings</button>
        </div>
      </div>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">◈</div>
          <div>
            <div className="brand-title">Revision</div>
            <div className="brand-sub">Local • SQLite • Spaced</div>
          </div>
        </div>

        <nav className="nav">
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}>
            <span className="nav-ico">◉</span> Today
            <span className="nav-badge">{dueTotal + newTotal}</span>
          </button>
          <button className={view === "review" ? "active" : ""} onClick={() => { refreshQueue(); setView("review"); }}>
            <span className="nav-ico">▶</span> Review
            <span className="nav-badge muted">{dueQueue.length}</span>
          </button>
          <button className={view === "browse" ? "active" : ""} onClick={() => setView("browse")}>
            <span className="nav-ico">▦</span> Browse
            <span className="nav-badge muted">{totalCards}</span>
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            <span className="nav-ico">⚙</span> Settings
          </button>
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-label">Tags</div>
          <div className="deck-list">
            {allTags.length === 0 ? (
              <span className="muted small">No tags yet — add tags like dsa, sd-concepts</span>
            ) : (
              allTags.map(([tag, count]) => (
                <div key={tag} className="deck-row" style={{ cursor: "pointer" }} onClick={() => { setView("browse"); setSearch(tag); }} title={`Filter by ${tag}`}>
                  <span className="deck-dot" style={{ background: tag.includes("dsa") ? "#0ea5e9" : tag.includes("sd") ? "#8b5cf6" : tag.includes("ai") ? "#10b981" : "#64748b" }} />
                  <span className="deck-name">{tag}</span>
                  <span className="deck-count">{count}</span>
                </div>
              ))
            )}
          </div>
          <div className="muted small" style={{ marginTop: 8 }}>Single deck “Revision” • {totalCards} cards • tags hold pillars</div>
        </div>

        <div className="sidebar-foot">
          <div className="foot-stat">
            <span>DB</span>
            <strong>revision.db</strong>
          </div>
          {isTauriEnv ? (
            <>
              <label className="foot-toggle">
                <input type="checkbox" checked={autostartEnabled} onChange={toggleAutostart} />
                <span>Launch at login</span>
              </label>
              <button className="btn small full" onClick={toggleWidget} style={{ marginTop: 8 }}>◫ Toggle Widget</button>
            </>
          ) : (
            <div className="foot-hint">Browser preview — no auto-update</div>
          )}
          <div className="foot-hint">Close → minimizes to tray<br />SQLite • local • portable<br />Space: reveal • 1/2/3: grade</div>
        </div>
      </aside>

      <main className="main">
        {view === "today" && (
          <div className="page">
            <header className="page-head">
              <div>
                <h1>Today</h1>
                <p className="muted">Your principal-level review queue. Due now + up to 20 new cards.</p>
              </div>
              <div className="head-actions">
                <button className="btn" onClick={handleExport}>Export CSV</button>
                <button className="btn" onClick={() => fileInputRef.current?.click()}>Import CSV</button>
                {isTauriEnv && <button className="btn" onClick={toggleWidget}>◫ Widget</button>}
                {!hasBlind75 && <button className="btn primary" onClick={handleSeedBlind75} style={{ background: "#0ea5e9", borderColor: "#0ea5e9" }}>Seed Blind 75</button>}
                <input ref={fileInputRef} type="file" accept=".csv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }} />
                <button className="btn primary" onClick={() => { refreshQueue(); setView("review"); }} disabled={dueQueue.length === 0}>
                  Start Review →
                </button>
              </div>
            </header>

            <div className="kpis">
              <div className="kpi">
                <div className="kpi-label">Due now</div>
                <div className="kpi-value due">{dueTotal}</div>
                <div className="kpi-sub">learning + review</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">New</div>
                <div className="kpi-value new">{newTotal}</div>
                <div className="kpi-sub">unseen cards</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Total</div>
                <div className="kpi-value">{totalCards}</div>
                <div className="kpi-sub">{decks.length} decks</div>
              </div>
              <div className="kpi cta" onClick={() => setView("browse")}>
                <div className="kpi-label">Add card</div>
                <div className="kpi-value">＋</div>
                <div className="kpi-sub">Front / Back + tags</div>
              </div>
            </div>

            {!hasBlind75 && totalCards > 0 && (
              <div className="empty" style={{ borderColor: "#0ea5e9", background: "#f0f9ff", marginBottom: 14 }}>
                <span className="empty-icon">📖</span>
                <h3>Blind 75 not yet seeded</h3>
                <p>You have {totalCards} cards (13 starter). Add the full LeetCode Blind 75 (75) from <a href="https://leetcode.com/problem-list/oizxjoit/" className="md-link" target="_blank" rel="noreferrer">oizxjoit</a> to get to 88 total. URLs will be clickable to open & code on LeetCode.</p>
                <div className="empty-actions">
                  <button className="btn primary" onClick={handleSeedBlind75} style={{ background: "#0ea5e9", borderColor: "#0ea5e9" }}>Seed Blind 75 (75) → {Math.min(88, totalCards + 75)} total</button>
                  <button className="btn" onClick={() => fileInputRef.current?.click()}>Or Import blind75.csv</button>
                </div>
              </div>
            )}

            {duplicateCount > 0 && (
              <div className="empty" style={{ borderColor: "#f59e0b", background: "#fffbeb", marginBottom: 14 }}>
                <span className="empty-icon">⚠</span>
                <h3>{duplicateCount} duplicates — Blind 75 imported multiple times</h3>
                <p>Same front detected in same deck. Deduplicate keeps one per question, or Reset to clear and re-seed cleanly.</p>
                {showDestructive ? (
                  <div className="empty-actions">
                    <button className="btn primary" onClick={handleDeduplicate} style={{ background: "#f59e0b", borderColor: "#f59e0b" }}>Deduplicate — remove {duplicateCount}</button>
                    <button className="btn" onClick={handleResetDb}>Reset Everything</button>
                  </div>
                ) : (
                  <div className="muted small" style={{ marginTop: 8 }}>Destructive actions are hidden — enable in <button className="link" onClick={() => setView("settings")}>Settings</button>.</div>
                )}
              </div>
            )}

            <div className="decks-grid">
              {(stats.length === 1 && tagStats.length > 0
                ? tagStats.map((t) => (
                    <div key={t.tag} className="deck-card" style={{ borderLeftColor: tagColor(t.tag) }}>
                      <div className="deck-card-head">
                        <span className="dot" style={{ background: tagColor(t.tag) }} />
                        <strong>{t.tag}</strong>
                        <span className="pill">{t.total} cards</span>
                      </div>
                      <div className="deck-card-stats">
                        <span className="stat due">{t.due} due</span>
                        <span className="stat">{t.total - t.due} new/other</span>
                      </div>
                      <div className="bar">
                        <div className="bar-fill" style={{ width: `${t.total ? Math.round((t.due / t.total) * 100) : 0}%`, background: tagColor(t.tag) }} />
                      </div>
                    </div>
                  ))
                : stats.map((s) => (
                    <div key={s.deck_id} className="deck-card" style={{ borderLeftColor: deckColor(s.deck_name) }}>
                      <div className="deck-card-head">
                        <span className="dot" style={{ background: deckColor(s.deck_name) }} />
                        <strong>{s.deck_name}</strong>
                        <span className="pill">{s.total} cards</span>
                      </div>
                      <div className="deck-card-stats">
                        <span className="stat due">{s.due} due</span>
                        <span className="stat new">{s.newCount} new</span>
                        <span className="stat">{s.learning} learning</span>
                        <span className="stat">{s.review} review</span>
                      </div>
                      <div className="bar">
                        <div className="bar-fill" style={{ width: `${s.total ? Math.round(((s.total - s.newCount) / s.total) * 100) : 0}%`, background: deckColor(s.deck_name) }} />
                      </div>
                    </div>
                  )))}
            </div>

            {totalCards === 0 && (
              <div className="empty">
                <span className="empty-icon">📚</span>
                <h3>No cards yet</h3>
                <p>Add your first DSA or System Design card, or seed the starter set.</p>
                <div className="empty-actions">
                  <button className="btn primary" onClick={handleSeed}>Seed 13 starter cards</button>
                  <button className="btn primary" onClick={handleSeedBlind75} style={{ background: "#0ea5e9", borderColor: "#0ea5e9" }}>Seed Blind 75 (75)</button>
                  <button className="btn" onClick={() => setShowAdd(true)}>Add card manually</button>
                </div>
                <div className="seed-preview">
                  <div className="muted small">Seed 13: 3 DSA, 3 SD Concepts, 2 SD Use Cases, 2 AI Concepts, 1 AI Use Case, 2 Behavioral<br />Blind 75: Full LeetCode Blind 75 list from oizxjoit (DSA) — also available as blind75.csv for Import</div>
                </div>
              </div>
            )}

            {totalCards > 0 && dueQueue.length === 0 && (
              <div className="empty done">
                <span className="empty-icon">🎉</span>
                <h3>All caught up</h3>
                <p>No cards due. Add new cards or check back later — Again cards reappear in ~10 minutes.</p>
                <button className="btn" onClick={() => setView("browse")}>Browse cards</button>
              </div>
            )}
          </div>
        )}

        {view === "review" && (
          <div className="page review-page">
            {!currentCard ? (
              <div className="empty done">
                <span className="empty-icon">✨</span>
                <h3>Queue empty</h3>
                <p>Nothing due right now. Great work.</p>
                <div className="empty-actions">
                  <button className="btn primary" onClick={() => setView("today")}>Back to Today</button>
                  <button className="btn" onClick={() => setView("browse")}>Browse cards</button>
                </div>
              </div>
            ) : (
              <>
                <div className="review-top">
                  <div className="crumb">
                    <span className="dot" style={{ background: deckColor(currentCard.deck_name ?? "") }} />
                    {currentCard.deck_name} <span className="muted">• {currentCard.tags || "no tags"}</span>
                  </div>
                  <div className="progress">{progress} • {currentCard.state} • {Math.round(currentCard.ease * 10) / 10} ease</div>
                </div>

                <div className="card-stage">
                  <div className="card">
                    <div className="card-label">Front — recall, then reveal</div>
                    <div className="card-front">
                      <MarkdownView text={currentCard.front} />
                    </div>
                    {extractUrls(currentCard.front).length > 0 && (
                      <div className="card-links">
                        {extractUrls(currentCard.front).map((u) => (
                          <button key={u} className="btn small" onClick={() => openExternal(u)}>↗ Open {(() => { try { return new URL(u).hostname.replace("www.", ""); } catch { return "Link"; } })()}</button>
                        ))}
                      </div>
                    )}
                    {!showAnswer ? (
                      <button className="btn primary large full" onClick={() => setShowAnswer(true)}>
                        Show Answer <span className="kbd">Space</span>
                      </button>
                    ) : (
                      <>
                        <div className="divider" />
                        <div className="card-label">Back</div>
                        <div className="card-back">
                          <MarkdownView text={currentCard.back} />
                        </div>
                        {extractUrls(currentCard.back).length > 0 && (
                          <div className="card-links" style={{ marginTop: 10 }}>
                            {extractUrls(currentCard.back).map((u) => (
                              <button key={u} className="btn small primary" onClick={() => openExternal(u)}>↗ Open & Try on {(() => { try { return new URL(u).hostname.replace("www.", ""); } catch { return "Link"; } })()}</button>
                            ))}
                          </div>
                        )}
                        <div className="grade-row">
                          <button className="grade again" onClick={() => grade(1)}>
                            <strong>Again</strong>
                            <span>10m • forgot / hint</span>
                            <span className="kbd">1</span>
                          </button>
                          <button className="grade good" onClick={() => grade(3)}>
                            <strong>Good</strong>
                            <span>{currentCard.state === "new" ? "1 day" : `~${Math.max(1, Math.round((currentCard.interval || 1) * currentCard.ease))}d`} • correct</span>
                            <span className="kbd">2 / Space</span>
                          </button>
                          <button className="grade easy" onClick={() => grade(4)}>
                            <strong>Easy</strong>
                            <span>{currentCard.state === "new" ? "3 days" : `~${Math.max(1, Math.round((currentCard.interval || 1) * currentCard.ease * 1.3))}d`} • effortless</span>
                            <span className="kbd">3</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="review-actions">
                    <button className="link" onClick={() => openEdit(currentCard)}>Edit card</button>
                    <button className="link" onClick={() => { setReviewIdx((i) => (i + 1) % dueQueue.length); setShowAnswer(false); }}>Skip</button>
                    <button className="link" onClick={() => setView("today")}>Exit review</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {view === "browse" && (
          <div className="page">
            <header className="page-head">
              <div>
                <h1>Browse</h1>
                <p className="muted">Search, filter, edit. Front/Back are markdown + code + image paste (stores as data URL).</p>
              </div>
              <button className="btn primary" onClick={() => { setEditing(null); setArticleUrl(""); setForm({ deckId: singleDeckId || decks[0]?.id || 0, front: "", back: "", tags: "" }); setShowAdd(true); }}>＋ Add Card</button>
            </header>

            <div className="toolbar">
              <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search front, back, tags… (⌘K)" />
              <select value={tagFilter ?? ""} onChange={(e) => setTagFilter(e.target.value || null)}>
                <option value="">All tags</option>
                {allTags.map(([t]) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                <option value="">All states</option>
                <option value="new">new</option>
                <option value="learning">learning</option>
                <option value="review">review</option>
              </select>
              <span className="muted small">{filteredBrowse.length} cards</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                {showDestructive ? (
                  <>
                    {duplicateCount > 0 && <button className="btn small" onClick={handleDeduplicate} style={{ background: "#fffbeb", borderColor: "#fde68a" }}>Deduplicate ({duplicateCount})</button>}
                    <button className="btn small" onClick={handleResetDb} style={{ color: "#b91c1c", borderColor: "#fecaca", background: "#fef2f2" }}>Reset DB</button>
                  </>
                ) : (
                  <button className="btn small" onClick={() => setView("settings")}>Show destructive in Settings</button>
                )}
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Deck</th>
                    <th>Front</th>
                    <th>Tags</th>
                    <th>State</th>
                    <th>Due</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBrowse.map((c) => {
                    const urls = extractUrls(c.front + " " + c.back);
                    return (
                      <tr key={c.id} onClick={() => setViewingCard(c)} style={{ cursor: "pointer" }}>
                        <td>
                          <span className="tag deck" style={{ borderColor: deckColor(c.deck_name ?? "") }}>
                            <span className="dot small" style={{ background: deckColor(c.deck_name ?? "") }} />
                            {c.deck_name}
                          </span>
                        </td>
                        <td className="front-cell" title={c.front}>{truncate(c.front, 84)}{urls.length > 0 && <span title={urls[0]}> 🔗</span>}</td>
                        <td><span className="muted small">{c.tags || "—"}</span></td>
                        <td><span className={`pill state ${c.state}`}>{c.state}</span></td>
                        <td className="muted small">{c.state === "new" ? "new" : dueLabel(c.due_at)}</td>
                        <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                          {urls.length > 0 && <button className="mini" onClick={() => openExternal(urls[0])} title={urls[0]}>↗</button>}
                          <button className="mini" onClick={() => openEdit(c)}>Edit</button>
                          {showDestructive && <button className="mini danger" onClick={() => handleDelete(c)}>Delete</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredBrowse.length === 0 && <div className="table-empty">No cards match filters.</div>}
            </div>
            <div className="browse-cards">
              {filteredBrowse.map((c) => {
                const urls = extractUrls(c.front + " " + c.back);
                return (
                  <div key={c.id} className="browse-card" onClick={() => setViewingCard(c)}>
                    <div className="browse-card-head">
                      <span className="tag deck" style={{ borderColor: deckColor(c.deck_name ?? "") }}>
                        <span className="dot small" style={{ background: deckColor(c.deck_name ?? "") }} />
                        {c.deck_name}
                      </span>
                      <span className={`pill state ${c.state}`}>{c.state}</span>
                      <span className="muted small" style={{ marginLeft: "auto" }}>{c.state === "new" ? "new" : dueLabel(c.due_at)}</span>
                    </div>
                    <div className="browse-card-front">{truncate(c.front, 120)}</div>
                    <div className="browse-card-meta">
                      <span>{c.tags || "—"}</span>
                      {urls.length > 0 && <span>🔗 {urls.length}</span>}
                    </div>
                    <div className="browse-card-actions" onClick={(e) => e.stopPropagation()}>
                      {urls.length > 0 && <button className="mini" onClick={() => openExternal(urls[0])}>↗ Open</button>}
                      <button className="mini" onClick={() => openEdit(c)}>Edit</button>
                      {showDestructive && <button className="mini danger" onClick={() => handleDelete(c)}>Delete</button>}
                      <button className="mini" onClick={() => setViewingCard(c)}>View</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {filteredBrowse.length === 0 && <div className="table-empty browse-cards-empty" style={{ display: "none" }}>No cards match filters.</div>}
          </div>
        )}

        {view === "settings" && (
          <div className="page">
            <header className="page-head">
              <div>
                <h1>Settings</h1>
                <p className="muted">Manage appearance and destructive actions.</p>
              </div>
            </header>
            <div className="card" style={{ maxWidth: 560 }}>
              <div className="form">
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span>
                    <strong>Show destructive actions</strong>
                    <span className="muted small" style={{ display: "block", fontWeight: 400 }}>Reveal Reset DB, Deduplicate, Delete deck/card in Today/Browse. Hidden by default to prevent accidents.</span>
                  </span>
                  <input type="checkbox" checked={showDestructive} onChange={(e) => setShowDestructive(e.target.checked)} style={{ width: 18, height: 18 }} />
                </label>
                <div className="divider" />
                <div className="muted small">
                  <strong>Tips:</strong> Destructive actions are double-confirmed. You can also reset via file: <code>rm ~/Library/Application\ Support/com.revision.app/revision.db*</code> then relaunch.
                </div>
                {showDestructive && (
                  <div className="empty" style={{ background: "#fffbeb", borderColor: "#fde68a", marginTop: 8 }}>
                    <h3>Destructive actions enabled</h3>
                    <p className="muted small">They will appear in Today/Browse. Disable the toggle to hide them again.</p>
                    <div className="empty-actions">
                      <button className="btn small" onClick={handleDeduplicate} style={{ background: "#fffbeb", borderColor: "#fde68a" }}>Deduplicate {duplicateCount > 0 ? `(${duplicateCount})` : ""}</button>
                      <button className="btn small" onClick={handleResetDb} style={{ color: "#b91c1c", borderColor: "#fecaca", background: "#fef2f2" }}>Reset DB — delete all</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {showAdd && (
        <div className="modal-backdrop" onClick={() => { setShowAdd(false); setEditing(null); setArticleUrl(""); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{editing ? "Edit Card" : "Add Card"}</h2>
              <button className="icon-btn" onClick={() => { setShowAdd(false); setEditing(null); setArticleUrl(""); }}>×</button>
            </div>
            <div className="form">
              <input type="hidden" value={form.deckId} readOnly />
              <div className="muted small">Single deck “Revision” • add pillar via tags: <code>dsa</code>, <code>sd-concepts</code>, <code>sd-use-cases</code>, <code>ai-concepts</code>, <code>ai-use-cases</code>, <code>behavioral</code></div>
              <label>
                Article URL <span className="muted">paste https://… to auto-organize with Zen (free)</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} placeholder="https://example.com/article" style={{ flex: 1 }} />
                  <button className="btn small primary" onClick={handleOrganizeArticle} disabled={isOrganizing || !articleUrl.trim()}>
                    {isOrganizing ? "Organizing…" : "✨ Auto-organize"}
                  </button>
                </div>
                <span className="muted small">Tries free Zen local (localhost:4096) then cloud, fallback heuristic — no API key needed. Or set custom endpoint in localStorage revision_zen_endpoint.</span>
              </label>
              <label>
                Front — question / prompt <span className="muted">markdown + `code` + ```blocks```</span>
                <textarea value={form.front} onChange={(e) => setForm({ ...form, front: e.target.value })} rows={4} placeholder="e.g., Two Sum — Pattern? Approach?" />
              </label>
              <label>
                Back — answer / code / tradeoffs
                <textarea value={form.back} onChange={(e) => setForm({ ...form, back: e.target.value })} rows={8} placeholder="**Pattern:** Hash Map&#10;&#10;```ts&#10;function twoSum(nums, target) ...&#10;```" />
              </label>
              <label>
                Tags <span className="muted">comma separated</span>
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="array, hashmap, easy" />
              </label>
              <div className="form-preview">
                <div className="form-preview-label">Preview</div>
                <div className="preview-cards">
                  <div className="preview-box"><strong>Front</strong><MarkdownView text={form.front || "_empty_"} /></div>
                  <div className="preview-box"><strong>Back</strong><MarkdownView text={form.back || "_empty_"} /></div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => { setShowAdd(false); setEditing(null); setArticleUrl(""); }}>Cancel</button>
              <button className="btn primary" onClick={handleAddOrUpdate}>{editing ? "Save Changes" : "Add Card"}</button>
            </div>
          </div>
        </div>
      )}

      {viewingCard && (
        <div className="modal-backdrop" onClick={() => setViewingCard(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <h2>View Card</h2>
              <button className="icon-btn" onClick={() => setViewingCard(null)}>×</button>
            </div>
            <div className="form">
              <div>
                <div className="form-preview-label">Deck • {viewingCard.deck_name} • {viewingCard.state} • {viewingCard.tags || "no tags"}</div>
                <div className="card" style={{ padding: 16 }}>
                  <div className="card-label">Front</div>
                  <div className="card-front"><MarkdownView text={viewingCard.front} /></div>
                  {extractUrls(viewingCard.front).length > 0 && (
                    <div className="card-links">
                      {extractUrls(viewingCard.front).map((u) => (
                        <button key={u} className="btn small" onClick={() => openExternal(u)}>↗ Open</button>
                      ))}
                    </div>
                  )}
                  <div className="divider" />
                  <div className="card-label">Back</div>
                  <div className="card-back"><MarkdownView text={viewingCard.back} /></div>
                  {extractUrls(viewingCard.back).length > 0 && (
                    <div className="card-links" style={{ marginTop: 10 }}>
                      {extractUrls(viewingCard.back).map((u) => (
                        <button key={u} className="btn small primary" onClick={() => openExternal(u)}>↗ Open & Try</button>
                      ))}
                    </div>
                  )}
                  <div className="muted small" style={{ marginTop: 10 }}>Tags: {viewingCard.tags || "—"}</div>
                  <div className="muted small" style={{ marginTop: 6 }}>{viewingCard.state} • {Math.round(viewingCard.ease * 10) / 10} ease • due {dueLabel(viewingCard.due_at)}</div>
                  <div className="grade-row" style={{ marginTop: 12 }}>
                    <button className="grade again" onClick={() => gradeViewing(1)}><strong>Again</strong><span>10m • forgot</span><span className="kbd">1</span></button>
                    <button className="grade good" onClick={() => gradeViewing(3)}><strong>Good</strong><span>{viewingCard.state === "new" ? "1d" : `~${Math.max(1, Math.round((viewingCard.interval || 1) * viewingCard.ease))}d`} • correct</span><span className="kbd">2</span></button>
                    <button className="grade easy" onClick={() => gradeViewing(4)}><strong>Easy</strong><span>{viewingCard.state === "new" ? "3d" : `~${Math.max(1, Math.round((viewingCard.interval || 1) * viewingCard.ease * 1.3))}d`} • easy</span><span className="kbd">3</span></button>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setViewingCard(null)}>Close</button>
              <button className="btn primary" onClick={() => { const c = viewingCard; setViewingCard(null); if (c) openEdit(c); }}>Edit</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function truncate(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function dueLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return "due now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.round(hrs / 24)}d`;
}
