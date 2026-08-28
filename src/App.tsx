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
  initDb,
  exportAllCards,
  createDeck,
  deleteDeck,
} from "./lib/db";
import { nextState } from "./lib/srs";
import type { CardWithState, Deck, DeckStats, Grade } from "./lib/types";
import { MarkdownView } from "./lib/markdown";
import { parseCsv, toCsv } from "./lib/csv";
import { SEED_CARDS } from "./lib/seed";
import "./App.css";

type View = "today" | "review" | "browse";

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

export default function App() {
  const [view, setView] = useState<View>("today");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [stats, setStats] = useState<DeckStats[]>([]);
  const [allCards, setAllCards] = useState<CardWithState[]>([]);
  const [dueQueue, setDueQueue] = useState<CardWithState[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [search, setSearch] = useState("");
  const [deckFilter, setDeckFilter] = useState<number | null>(null);
  const [stateFilter, setStateFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<CardWithState | null>(null);
  const [form, setForm] = useState({ deckId: 0, front: "", back: "", tags: "" });
  const [showDeckMgr, setShowDeckMgr] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [isTauriEnv, setIsTauriEnv] = useState(false);
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
        // Detect Tauri env and load autostart state
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
    if (deckFilter) rows = rows.filter((c) => c.deck_id === deckFilter);
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
  }, [allCards, deckFilter, stateFilter, search]);

  const dueTotal = stats.reduce((a, s) => a + s.due, 0);
  const newTotal = stats.reduce((a, s) => a + s.newCount, 0);
  const totalCards = stats.reduce((a, s) => a + s.total, 0);

  async function handleAddOrUpdate() {
    if (!form.front.trim() || !form.back.trim()) {
      setToast("Front and Back required");
      return;
    }
    if (editing) {
      await updateCard(editing.id, form.deckId, form.front, form.back, form.tags);
      setToast("Card updated");
    } else {
      await createCard(form.deckId, form.front, form.back, form.tags);
      setToast("Card added");
    }
    setShowAdd(false);
    setEditing(null);
    setForm({ deckId: decks[0]?.id ?? 0, front: "", back: "", tags: "" });
    await refresh();
    await refreshQueue();
  }

  function openEdit(c: CardWithState) {
    setEditing(c);
    setForm({ deckId: c.deck_id, front: c.front, back: c.back, tags: c.tags });
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

  async function handleCreateDeck() {
    const name = newDeckName.trim();
    if (!name) return;
    if (decks.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      setToast("Deck already exists");
      return;
    }
    await createDeck(name);
    setNewDeckName("");
    await refresh();
    setToast(`Deck "${name}" created`);
  }

  async function handleDeleteDeck(id: number, name: string) {
    const count = allCards.filter((c) => c.deck_id === id).length;
    if (!confirm(`Delete deck "${name}" and its ${count} cards? This cannot be undone.`)) return;
    await deleteDeck(id);
    await refresh();
    await refreshQueue();
    setToast("Deck deleted");
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

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Opening prep.db…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">◈</div>
          <div>
            <div className="brand-title">Principal Prep</div>
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
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-label">
            Decks <button className="mini" onClick={() => setShowDeckMgr((v) => !v)}>{showDeckMgr ? "−" : "+"}</button>
          </div>
          <div className="deck-list">
            {decks.map((d) => {
              const s = stats.find((x) => x.deck_id === d.id);
              return (
                <div key={d.id} className="deck-row">
                  <span className="deck-dot" style={{ background: deckColor(d.name) }} />
                  <span className="deck-name" title={d.name}>{d.name}</span>
                  <span className="deck-count">{s ? `${s.due} due • ${s.total}` : ""}</span>
                </div>
              );
            })}
          </div>
          {showDeckMgr && (
            <div className="deck-mgr">
              <div className="deck-mgr-row">
                <input value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} placeholder="New deck name" onKeyDown={(e) => e.key === "Enter" && handleCreateDeck()} />
                <button className="btn small" onClick={handleCreateDeck}>Add</button>
              </div>
              <div className="deck-mgr-list">
                {decks.map((d) => (
                  <div key={d.id} className="deck-mgr-item">
                    <span>{d.name}</span>
                    <button className="link danger" onClick={() => handleDeleteDeck(d.id, d.name)}>delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-foot">
          <div className="foot-stat">
            <span>DB</span>
            <strong>prep.db</strong>
          </div>
          {isTauriEnv ? (
            <label className="foot-toggle">
              <input type="checkbox" checked={autostartEnabled} onChange={toggleAutostart} />
              <span>Launch at login</span>
            </label>
          ) : (
            <div className="foot-hint">Browser preview — no autostart</div>
          )}
          <div className="foot-hint">Close → minimizes to tray<br />SQLite • portable<br />Space: reveal • 1/2/3: grade</div>
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

            <div className="decks-grid">
              {stats.map((s) => (
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
              ))}
            </div>

            {totalCards === 0 && (
              <div className="empty">
                <h3>No cards yet</h3>
                <p>Add your first DSA or System Design card, or seed the starter set.</p>
                <div className="empty-actions">
                  <button className="btn primary" onClick={handleSeed}>Seed 13 starter cards</button>
                  <button className="btn" onClick={() => setShowAdd(true)}>Add card manually</button>
                </div>
                <div className="seed-preview">
                  <div className="muted small">Seed includes: 3 DSA, 3 SD Concepts, 2 SD Use Cases, 2 AI Concepts, 1 AI Use Case, 2 Behavioral</div>
                </div>
              </div>
            )}

            {totalCards > 0 && dueQueue.length === 0 && (
              <div className="empty done">
                <h3>✓ All caught up</h3>
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
              <button className="btn primary" onClick={() => { setEditing(null); setForm({ deckId: decks[0]?.id ?? 0, front: "", back: "", tags: "" }); setShowAdd(true); }}>＋ Add Card</button>
            </header>

            <div className="toolbar">
              <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search front, back, tags, deck… (⌘K)" />
              <select value={deckFilter ?? ""} onChange={(e) => setDeckFilter(e.target.value ? Number(e.target.value) : null)}>
                <option value="">All decks</option>
                {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                <option value="">All states</option>
                <option value="new">new</option>
                <option value="learning">learning</option>
                <option value="review">review</option>
              </select>
              <span className="muted small">{filteredBrowse.length} cards</span>
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
                  {filteredBrowse.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="tag deck" style={{ borderColor: deckColor(c.deck_name ?? "") }}>
                          <span className="dot small" style={{ background: deckColor(c.deck_name ?? "") }} />
                          {c.deck_name}
                        </span>
                      </td>
                      <td className="front-cell" title={c.front}>{truncate(c.front, 84)}</td>
                      <td><span className="muted small">{c.tags || "—"}</span></td>
                      <td><span className={`pill state ${c.state}`}>{c.state}</span></td>
                      <td className="muted small">{c.state === "new" ? "new" : dueLabel(c.due_at)}</td>
                      <td className="row-actions">
                        <button className="mini" onClick={() => openEdit(c)}>Edit</button>
                        <button className="mini danger" onClick={() => handleDelete(c)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredBrowse.length === 0 && <div className="table-empty">No cards match filters.</div>}
            </div>
          </div>
        )}
      </main>

      {showAdd && (
        <div className="modal-backdrop" onClick={() => { setShowAdd(false); setEditing(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{editing ? "Edit Card" : "Add Card"}</h2>
              <button className="icon-btn" onClick={() => { setShowAdd(false); setEditing(null); }}>×</button>
            </div>
            <div className="form">
              <label>
                Deck
                <select value={form.deckId} onChange={(e) => setForm({ ...form, deckId: Number(e.target.value) })}>
                  {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
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
              <button className="btn" onClick={() => { setShowAdd(false); setEditing(null); }}>Cancel</button>
              <button className="btn primary" onClick={handleAddOrUpdate}>{editing ? "Save Changes" : "Add Card"}</button>
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
