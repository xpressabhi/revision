import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDecks,
  getDeckStats,
  getAllCardsWithState,
  createCard,
  updateCard,
  deleteCard,
  updateCardState,
  logReview,
  bulkCreateCards,
  clearAllCards,
  deduplicateCards,
  initDb,
  getReviews,
} from "./lib/db";
import { nextState } from "./lib/fsrs";
import type { CardState, CardWithState, DeckStats, Grade, ReviewRow, View } from "./lib/types";
import { parseCsv, toCsv } from "./lib/csv";
import { SEED_CARDS } from "./lib/seed";
import { loadDemoData } from "./lib/demo";
import { buildTagTree, lastReviewMap, scopeCards, streakLength, type StudyScope } from "./lib/derive";
import { matchesChord, scopeKeys } from "./lib/hotkeys";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

import { Sidebar } from "./components/Sidebar";
import { CommandBar, type CmdAction } from "./components/CommandBar";
import { Inspector } from "./components/Inspector";
import { Dashboard } from "./components/Dashboard";
import { ReviewView, type Pomo } from "./components/ReviewView";
import { BrowseView } from "./components/BrowseView";
import { AnalyticsView } from "./components/AnalyticsView";
import { SettingsView, type ThemeId } from "./components/SettingsView";
import { EditorModal } from "./components/EditorModal";
import { QuickCapture } from "./components/QuickCapture";
import { Toasts, type ToastMsg } from "./components/Toast";
import { Icon, Keycap } from "./components/ui";

type SidebarMode = "full" | "rail" | "hidden";
type EditorState = { card: CardWithState | null } | null;

const THEME_ORDER: ThemeId[] = ["dark-a", "light-a", "dark-b", "light-b"];
const VIEW_LABEL: Record<View, string> = {
  dashboard: "Dashboard",
  browse: "Browse",
  review: "Review",
  analytics: "Analytics",
  settings: "Settings",
};

let toastSeq = 1;

export default function App() {
  const [isTauri, setIsTauri] = useState(false);
  const [loading, setLoading] = useState(true);
  const [decks, setDecks] = useState<{ id: number; name: string; created_at: string }[]>([]);
  const [cards, setCards] = useState<CardWithState[]>([]);
  const [stats, setStats] = useState<DeckStats[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [theme, setTheme] = useState<ThemeId>(() => (localStorage.getItem("recall_theme") as ThemeId) || "dark-a");
  const [density, setDensity] = useState<"relaxed" | "standard" | "compact">(() => (localStorage.getItem("recall_density") as "relaxed" | "standard" | "compact") || "standard");
  const [desiredRetention, setDesiredRetention] = useState<number>(() => Number(localStorage.getItem("recall_retention") ?? 0.9));
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("full");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [chromeAvailable, setChromeAvailable] = useState<boolean | null>(null);
  const [browseGroup, setBrowseGroup] = useState<string | null>(null);
  const [browseState, setBrowseState] = useState("");
  const [airGestures, setAirGestures] = useState<boolean>(() => localStorage.getItem("recall_air_gestures") === "1");

  const [pomo, setPomo] = useState<Pomo>({ seconds: 25 * 60, running: false, mode: "focus" });

  type ReviewState = {
    scope: StudyScope;
    queue: CardWithState[];
    idx: number;
    shown: boolean;
    revealed: number;
    hintLevel: number;
    answered: number;
    again: number;
    good: number;
    buried: Set<number>;
    undo: { cardId: number; prev: CardState }[];
  };
  const [review, setReview] = useState<ReviewState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastReview = useMemo(() => lastReviewMap(reviews), [reviews]);
  const groups = useMemo(() => buildTagTree(cards, lastReview), [cards, lastReview]);

  const toast = useCallback((text: string, kind: ToastMsg["kind"] = "info", undo?: () => void) => {
    const id = toastSeq++;
    setToasts((ts) => [...ts.slice(-3), { id, kind, text, undo }]);
  }, []);

  const refresh = useCallback(async () => {
    const [d, s, a, r] = await Promise.all([getDecks(), getDeckStats(), getAllCardsWithState(), getReviews()]);
    setDecks(d);
    setStats(s);
    setCards(a);
    setReviews(r);
    const due = s.reduce((x, y) => x + y.due, 0);
    const newCount = s.reduce((x, y) => x + y.newCount, 0);
    const total = s.reduce((x, y) => x + y.total, 0);
    if (isTauri) {
      invoke("update_tray", { due, new: newCount, total, decks: s.map((x) => ({ name: x.deck_name, due: x.due, total: x.total })) }).catch(() => {});
    }
  }, [isTauri]);

  // ── boot ──
  useEffect(() => {
    (async () => {
      try {
        await initDb();
        const tauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
        setIsTauri(tauri);
        const d = await getDecks();
        const a = await getAllCardsWithState();
        if (a.length === 0 && d[0]) {
          const created = await bulkCreateCards(SEED_CARDS.map(({ deck, ...rest }) => ({ deckName: deck, ...rest })));
          toast(`Seeded ${created} starter cards`, "success");
        }
        await refresh();
        if (tauri) {
          try {
            const { isEnabled } = await import("@tauri-apps/plugin-autostart");
            setAutostart(await isEnabled());
          } catch {}
          try {
            const { chromeBookmarksExists } = await import("./lib/bookmarks");
            setChromeAvailable(await chromeBookmarksExists());
          } catch {
            setChromeAvailable(false);
          }
        }
      } catch (e) {
        console.error(e);
        toast(String(e), "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh, toast]);

  // ── tray → review ──
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (isTauri) {
      (async () => {
        try {
          const { listen } = await import("@tauri-apps/api/event");
          unlisten = await listen("tray-review", () => startReview({ kind: "all" }));
        } catch {}
      })();
    }
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauri, cards, lastReview]);

  // ── theme / density side effects ──
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("recall_theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.density = density;
    localStorage.setItem("recall_density", density);
  }, [density]);
  useEffect(() => {
    localStorage.setItem("recall_retention", String(desiredRetention));
  }, [desiredRetention]);
  useEffect(() => {
    document.body.classList.toggle("focus-mode", focusMode);
  }, [focusMode]);
  useEffect(() => {
    localStorage.setItem("recall_air_gestures", airGestures ? "1" : "0");
  }, [airGestures]);

  // ── pomodoro ──
  useEffect(() => {
    if (!pomo.running) return;
    const id = window.setInterval(() => {
      setPomo((p) => {
        if (p.seconds <= 1) {
          if (p.mode === "focus") {
            toast("Focus session done — take a 5 min break", "success");
            return { seconds: 5 * 60, running: false, mode: "break" };
          }
          toast("Break over — ready for the next focus block", "info");
          return { seconds: 25 * 60, running: false, mode: "focus" };
        }
        return { ...p, seconds: p.seconds - 1 };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [pomo.running, toast]);

  // ── keyboard master ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;

      if (cmdOpen || captureOpen) return; // those surfaces own their keys

      if (matchesChord(e, "mod+k")) {
        e.preventDefault();
        setCmdOpen((v) => !v);
        return;
      }
      if (matchesChord(e, "mod+shift+k")) {
        e.preventDefault();
        setCaptureOpen((v) => !v);
        return;
      }
      if (matchesChord(e, "mod+shift+t")) {
        e.preventDefault();
        setTheme((t) => THEME_ORDER[(THEME_ORDER.indexOf(t) + 1) % THEME_ORDER.length]);
        toast(`Theme → ${document.documentElement.dataset.theme}`, "info");
        return;
      }
      if (matchesChord(e, "mod+shift+f")) {
        e.preventDefault();
        setFocusMode((f) => !f);
        return;
      }
      if (matchesChord(e, "mod+s")) {
        e.preventDefault();
        setSidebarMode((m) => (m === "full" ? "rail" : m === "rail" ? "hidden" : "full"));
        return;
      }
      if (matchesChord(e, "alt+mod+i")) {
        e.preventDefault();
        setInspectorOpen((v) => !v);
        return;
      }
      if (matchesChord(e, "ctrl+mod+1")) {
        e.preventDefault();
        setDensity("relaxed");
        return;
      }
      if (matchesChord(e, "ctrl+mod+2")) {
        e.preventDefault();
        setDensity("standard");
        return;
      }
      if (matchesChord(e, "ctrl+mod+3")) {
        e.preventDefault();
        setDensity("compact");
        return;
      }
      if (matchesChord(e, "mod+comma")) {
        e.preventDefault();
        setView("settings");
        return;
      }
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (helpOpen && e.key === "Escape") {
        setHelpOpen(false);
        return;
      }
      if (typing) return;

      if (matchesChord(e, "mod+1")) { setView("dashboard"); return; }
      if (matchesChord(e, "mod+2")) { setView("browse"); return; }
      if (matchesChord(e, "mod+3")) { if (!review || review.idx >= review.queue.length) startReview({ kind: "all" }); else setView("review"); return; }
      if (matchesChord(e, "mod+4")) { setView("analytics"); return; }
      if (matchesChord(e, "mod+5")) { setView("settings"); return; }
      if (matchesChord(e, "mod+n")) { setEditor({ card: null }); return; }

      // review scope
      if (view === "review" && review && review.queue.length) {
        const card = review.queue[review.idx];
        if (!card) return;
        if ((matchesChord(e, "space") || matchesChord(e, "enter")) && !typing) {
          e.preventDefault();
          if (!review.shown) {
            setReview((r) => (r ? { ...r, shown: true } : r));
          } else {
            void grade(3);
          }
          return;
        }
        if (["1", "2", "3", "4"].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          if (!review.shown) {
            setReview((r) => (r ? { ...r, shown: true } : r));
          } else {
            void grade(Number(e.key) as Grade);
          }
          return;
        }
        if (!typing) {
          if (matchesChord(e, "g") && !review.shown) {
            e.preventDefault();
            setReview((r) => (r ? { ...r, revealed: r.revealed + 1 } : r));
          } else if (matchesChord(e, "h")) {
            e.preventDefault();
            setReview((r) => (r ? { ...r, hintLevel: r.hintLevel + 1 } : r));
          } else if (matchesChord(e, "e")) {
            e.preventDefault();
            setEditor({ card });
          } else if (matchesChord(e, "s")) {
            e.preventDefault();
            void suspendCard(card);
          } else if (matchesChord(e, "b")) {
            e.preventDefault();
            buryCard();
          } else if (matchesChord(e, "shift+g")) {
            e.preventDefault();
            undoGrade();
          } else if (matchesChord(e, "ctrl+arrowright")) {
            e.preventDefault();
            advance();
          } else if (matchesChord(e, "mod+enter")) {
            e.preventDefault();
            endReview();
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, review, cmdOpen, captureOpen, helpOpen, cards, lastReview, desiredRetention]);

  // ═══ review actions ═══
  const startReview = useCallback((scope: StudyScope) => {
    setReview((current) => {
      setView("review");
      const queue = scopeCards(cards, scope, lastReview);
      if (queue.length === 0) {
        toast("Queue clear — nothing due in this scope", "info");
        return current;
      }
      return {
        scope,
        queue,
        idx: 0,
        shown: false,
        revealed: 0,
        hintLevel: 0,
        answered: 0,
        again: 0,
        good: 0,
        buried: new Set(),
        undo: [],
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, lastReview, toast]);

  const patchCard = (id: number, patch: Partial<CardWithState>) => {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setReview((r) => (r ? { ...r, queue: r.queue.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : r));
  };

  const grade = async (g: Grade) => {
    const r = review;
    if (!r) return;
    const card = r.queue[r.idx];
    if (!card) return;
    const prev: CardState = {
      card_id: card.id,
      due_at: card.due_at,
      interval: card.interval,
      ease: card.ease,
      reps: card.reps,
      state: card.state,
      stability: card.stability,
      difficulty: card.difficulty,
      updated_at: card.updated_at,
    };
    const ns = nextState(prev, g, new Date(), desiredRetention);
    await updateCardState(ns);
    await logReview(card.id, g);
    setReviews((rs) => [...rs, { id: -rs.length, card_id: card.id, grade: g, created_at: new Date().toISOString() }]);
    patchCard(card.id, { due_at: ns.due_at, interval: ns.interval, ease: ns.ease, reps: ns.reps, state: ns.state, stability: ns.stability, difficulty: ns.difficulty, updated_at: ns.updated_at });
    setReview((cur) => {
      if (!cur) return cur;
      const answered = cur.answered + 1;
      const next = {
        ...cur,
        answered,
        again: cur.again + (g === 1 ? 1 : 0),
        good: cur.good + (g >= 3 ? 1 : 0),
        idx: cur.idx + 1,
        shown: false,
        revealed: 0,
        hintLevel: 0,
        undo: [...cur.undo.slice(-30), { cardId: card.id, prev }],
      };
      return next;
    });
    if (r.idx + 1 >= r.queue.length) {
      const streak = streakLength([...reviews, { id: 0, card_id: 0, grade: 0, created_at: new Date().toISOString() }]);
      setCelebration(`+${Math.max(1, streak)} day streak`);
      window.setTimeout(() => setCelebration(null), 2000);
    }
  };

  const advance = () => {
    setReview((r) => (r ? { ...r, idx: r.idx + 1, shown: false, revealed: 0 } : r));
  };

  const undoGrade = () => {
    setReview((r) => {
      if (!r || r.undo.length === 0 || r.idx === 0) return r;
      const last = r.undo[r.undo.length - 1];
      void updateCardState(last.prev);
      setReviews((rs) => rs.filter((x) => !(x.card_id === last.cardId && x.id < 0)));
      return { ...r, undo: r.undo.slice(0, -1), idx: r.idx - 1, shown: false, answered: Math.max(0, r.answered - 1), again: Math.max(0, r.again - (0)), good: Math.max(0, r.good - 0) };
    });
  };

  const buryCard = () => {
    setReview((r) => {
      if (!r) return r;
      const card = r.queue[r.idx];
      const buried = new Set(r.buried);
      buried.add(card.id);
      return { ...r, buried, idx: r.idx + 1, shown: false, revealed: 0 };
    });
  };

  const suspendCard = async (card: CardWithState) => {
    const tags = card.tags.includes("suspended") ? card.tags : card.tags ? `${card.tags}, suspended` : "suspended";
    await updateCard(card.id, card.deck_id, card.front, card.back, tags);
    patchCard(card.id, { tags });
    toast("Card suspended — hidden from queues", "info");
    advance();
  };

  const endReview = () => {
    setReview(null);
    setView("dashboard");
  };

  // ═══ editor save ═══
  const saveCard = async (front: string, back: string, tags: string) => {
    const deckId = decks[0]?.id ?? 1;
    if (editor?.card) {
      await updateCard(editor.card.id, editor.card.deck_id, front, back, tags);
      patchCard(editor.card.id, { front, back, tags, updated_at: new Date().toISOString() });
      toast("Card updated", "success");
    } else {
      await createCard(deckId, front, back, tags);
      toast("Card created", "success");
      await refresh();
    }
    if (view === "review" && !editor?.card) startReview({ kind: "all" });
  };

  const onDeleteCard = async (card: CardWithState) => {
    await deleteCard(card.id);
    setCards((cs) => cs.filter((c) => c.id !== card.id));
    setReview((r) => (r ? { ...r, queue: r.queue.filter((c) => c.id !== card.id) } : r));
    toast("Card deleted", "warn");
  };

  // ═══ imports/exports ═══
  const importCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      toast("No valid rows in CSV", "warn");
      return;
    }
    const created = await bulkCreateCards(rows.map(({ deck, ...rest }) => ({ deckName: deck, ...rest })));
    await refresh();
    toast(`Imported ${created} cards`, "success");
  };

  const exportCsv = async () => {
    const all = await getAllCardsWithState();
    const csv = toCsv(all.map((c) => ({ deck: c.deck_name ?? "Revision", front: c.front, back: c.back, tags: c.tags })));
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revision-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${all.length} cards`, "success");
  };

  const importBookmarks = async () => {
    const { readChromeBookmarksFile, toDrafts } = await import("./lib/bookmarks");
    const json = await readChromeBookmarksFile();
    const { parseChromeBookmarksJson } = await import("./lib/bookmarks");
    const raw = parseChromeBookmarksJson(json);
    const existingUrls = new Set(cards.map((c) => c.back).flatMap((b) => b.match(/https?:\/\/[^\s]+/g) ?? []));
    const existingFronts = new Set(cards.map((c) => c.front.trim()));
    const { willAdd } = toDrafts(raw, existingUrls, existingFronts);
    if (!willAdd.length) {
      toast("No new bookmarks to import", "info");
      return;
    }
    let added = 0;
    for (const d of willAdd.slice(0, 120)) {
      const back = `**Link:** ${d.url}\n\n**Source:** ${d.folderPath || "bookmarks"}`;
      await createCard(decks[0]?.id ?? 1, d.title, back, d.tags || "bookmark");
      added++;
    }
    await refresh();
    toast(`Imported ${added} bookmarks`, "success");
  };

  const importArticle = async (url: string) => {
    try {
      const { organizeArticle } = await import("./lib/article");
      toast("Fetching article…", "info");
      const org = await organizeArticle(url);
      await createCard(decks[0]?.id ?? 1, org.front, org.back, org.tags);
      await refresh();
      toast("Article card created", "success");
    } catch (e) {
      toast(`Article import failed: ${String(e).slice(0, 80)}`, "error");
    }
  };

  // ═══ command palette ═══
  const smartActions = useMemo<CmdAction[]>(() => {
    const study = (id: string) => startReview({ kind: "smart", id: id as "due" | "new" | "learning" | "stuck" });
    return [
      { id: "study-due", ico: "clock", title: "Study: Due now", sub: "all overdue cards", group: "Study", run: () => study("due") },
      { id: "study-stuck", ico: "warn", title: "Study: Stuck (<80% R)", sub: "cards projected below target retention", group: "Study", run: () => study("stuck") },
      { id: "study-new", ico: "sparkles", title: "Study: New + Learning", sub: "fresh cards and relearning lapses", group: "Study", run: () => study("learning") },
      { id: "study-all", ico: "bolt", title: "Study: Everything", sub: "full queue — learning → due → new", group: "Study", tags: ["⌘3"], run: () => startReview({ kind: "all" }) },
    ];
  }, [startReview]);

  const navActions = useMemo<CmdAction[]>(() => [
    { id: "nav-dash", ico: "graph", title: "Go to Dashboard", group: "Navigate", tags: ["⌘1"], run: () => setView("dashboard") },
    { id: "nav-browse", ico: "layers", title: "Go to Browse", group: "Navigate", tags: ["⌘2"], run: () => setView("browse") },
    { id: "nav-analytics", ico: "chart", title: "Go to Analytics", group: "Navigate", tags: ["⌘4"], run: () => setView("analytics") },
    { id: "nav-settings", ico: "settings", title: "Go to Settings", group: "Navigate", tags: ["⌘5"], run: () => setView("settings") },
  ], []);

  const utilActions = useMemo<CmdAction[]>(() => [
    { id: "new-card", ico: "plus", title: "New card", sub: "opens the editor", group: "Actions", tags: ["⌘N"], run: () => setEditor({ card: null }) },
    { id: "capture", ico: "capture", title: "Quick capture", sub: "flashcard from anywhere", group: "Actions", tags: ["⌘⇧K"], run: () => setCaptureOpen(true) },
    { id: "toggle-sidebar", ico: "sidebar", title: "Toggle sidebar", sub: sidebarMode, group: "Actions", run: () => setSidebarMode((m) => (m === "full" ? "rail" : m === "rail" ? "hidden" : "full")) },
    { id: "toggle-inspector", ico: "panel", title: "Toggle inspector", sub: inspectorOpen ? "on" : "off", group: "Actions", tags: ["⌥⌘I"], run: () => setInspectorOpen((v) => !v) },
    { id: "theme", ico: "moon", title: "Cycle theme", sub: theme, group: "Actions", tags: ["⌘⇧T"], run: () => setTheme((t) => THEME_ORDER[(THEME_ORDER.indexOf(t) + 1) % THEME_ORDER.length]) },
    { id: "focus", ico: "focus", title: "Toggle focus mode", sub: "hide all chrome", group: "Actions", tags: ["⌘⇧F"], run: () => setFocusMode((f) => !f) },
    { id: "demodata", ico: "sparkles", title: "Load demo content", sub: "decks + 90 days of review history", group: "Actions", run: async () => { await loadDemoData(); await refresh(); toast("Demo content loaded", "success"); } },
    { id: "import", ico: "upload", title: "Import CSV", group: "Actions", run: () => fileInputRef.current?.click() },
    { id: "export", ico: "download", title: "Export CSV", group: "Actions", run: () => void exportCsv() },
  ], [sidebarMode, inspectorOpen, theme, refresh, toast]);

  const actions = useMemo(() => [...smartActions, ...navActions, ...utilActions], [smartActions, navActions, utilActions]);

  // ── derived for views ──
  const reviewCard = review ? review.queue[review.idx] ?? null : null;
  const counts = useMemo(() => ({
    total: cards.length,
    due: stats.reduce((a, s) => a + s.due, 0),
    newCount: stats.reduce((a, s) => a + s.newCount, 0),
    learning: stats.reduce((a, s) => a + s.learning, 0),
  }), [cards.length, stats]);

  const inspectorMode = view === "review" && reviewCard ? "review" : view === "browse" ? "browse" : "idle";
  const inspectorCard = reviewCard ?? null;

  if (loading) {
    return (
      <div className="shell">
        <div className="titlebar" />
        <div className="shell-body">
          <div className="sidebar"><div className="skeleton" style={{ flex: 1, margin: 12, borderRadius: 12 }} /></div>
          <div className="canvas"><div className="canvas-inner"><div className="skeleton" style={{ height: 160 }} /><div className="skeleton" style={{ height: 220 }} /><div className="skeleton" style={{ height: 140 }} /></div></div>
          <div className="inspector"><div className="skeleton" style={{ flex: 1, margin: 12, borderRadius: 12 }} /></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`shell ${sidebarMode === "rail" ? "rail" : ""} ${sidebarMode === "hidden" ? "no-sidebar" : ""} ${!inspectorOpen ? "no-inspector" : ""}`}>
      {/* titlebar */}
      <header className={`titlebar ${isTauri ? "is-tauri" : ""}`}>
        <div className="tb-title" data-tauri-drag-region>
          <img className="tb-logo" src="/revision-logo.png" alt="Revision" draggable={false} />
          <span data-tauri-drag-region>Revision</span>
          <span className="muted" style={{ fontWeight: 400 }}>{VIEW_LABEL[view]}</span>
        </div>
        <div className="tb-actions">
          <button className="tb-search" onClick={() => setCmdOpen(true)}>
            <Icon name="search" size={12} /> <span>Search anything…</span> <kbd className="keycap" style={{ marginLeft: "auto" }}>⌘K</kbd>
          </button>
          <button className="btn-ghost" title="Quick capture (⌘⇧K)" onClick={() => setCaptureOpen(true)}><Icon name="capture" size={14} /></button>
          <button className="btn-ghost" title="Help (⌘/)" onClick={() => setHelpOpen((v) => !v)}><Icon name="keyboard" size={14} /></button>
          <button className="btn-ghost" title="Settings (⌘,)" onClick={() => setView("settings")}><Icon name="settings" size={14} /></button>
        </div>
      </header>

      <div className={`shell-body ${view === "review" && review ? "reviewing" : ""}`}>
        <Sidebar
          groups={groups}
          cards={cards}
          lastReview={lastReview}
          rail={sidebarMode === "rail"}
          activeGroup={view === "browse" ? browseGroup : null}
          activeSmart={null}
          onGroup={(g) => { setBrowseGroup(g); setView("browse"); }}
          onSmart={(id) => startReview({ kind: "smart", id: id as "due" | "new" | "learning" | "stuck" })}
          onStudy={(scope) => startReview(scope)}
          onNewCard={() => setEditor({ card: null })}
          onView={(v) => setView(v)}
          toggleFocus={() => setFocusMode((f) => !f)}
          reviewActive={view === "review" && !!review}
        />

        <main className="canvas">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importCsv(f);
            e.target.value = "";
          }} />
          {view === "dashboard" && (
            <Dashboard
              cards={cards}
              reviews={reviews}
              lastReview={lastReview}
              desiredRetention={desiredRetention}
              onStudyGroup={(g) => startReview({ kind: "group", group: g })}
              onStudyAll={() => startReview({ kind: "all" })}
              onBrowseGroup={(g) => { setBrowseGroup(g); setView("browse"); }}
              onNewCard={() => setEditor({ card: null })}
            />
          )}
          {view === "review" && review && (
            <ReviewView
              queue={review.queue.filter((c) => !review.buried.has(c.id))}
              idx={review.idx}
              shown={review.shown}
              revealed={review.revealed}
              lastReviewIso={reviewCard ? lastReview.get(reviewCard.id) : null}
              desiredRetention={desiredRetention}
              onFlip={() => setReview((r) => (r ? { ...r, shown: !r.shown } : r))}
              onGrade={(g) => void grade(g)}
              onSkip={advance}
              onUndo={undoGrade}
              onEdit={() => reviewCard && setEditor({ card: reviewCard })}
              onSuspend={() => reviewCard && void suspendCard(reviewCard)}
              onBury={buryCard}
              onEnd={endReview}
              pomo={pomo}
              onPomoToggle={() => setPomo((p) => ({ ...p, running: !p.running }))}
              onPomoSkip={() => setPomo((p) => (p.mode === "focus" ? { seconds: 5 * 60, running: false, mode: "break" } : { seconds: 25 * 60, running: false, mode: "focus" }))}
              onPomoReset={() => setPomo((p) => ({ seconds: p.mode === "focus" ? 25 * 60 : 5 * 60, running: false, mode: p.mode }))}
              canUndo={(review.undo.length > 0 && review.idx > 0)}
              sessionStats={{ answered: review.answered, again: review.again, good: review.good }}
              airGestures={airGestures}
            />
          )}
          {view === "browse" && (
            <BrowseView
              cards={cards}
              lastReview={lastReview}
              groupFilter={browseGroup}
              stateFilter={browseState}
              onGroupFilter={setBrowseGroup}
              onStateFilter={setBrowseState}
              onEdit={(c) => setEditor({ card: c })}
              onDelete={(c) => void onDeleteCard(c)}
              onNew={() => setEditor({ card: null })}
              counts={counts}
              onImportCsv={importCsv}
              onExportCsv={exportCsv}
            />
          )}
          {view === "analytics" && <AnalyticsView cards={cards} reviews={reviews} lastReview={lastReview} />}
          {view === "settings" && (
            <SettingsView
              theme={theme}
              onTheme={(t) => setTheme(t)}
              density={density}
              onDensity={(d) => setDensity(d)}
              desiredRetention={desiredRetention}
              onRetention={setDesiredRetention}
              autostart={autostart}
              onAutostart={async (v) => {
                try {
                  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
                  if (v) await enable(); else await disable();
                  setAutostart(v);
                  toast(`Launch at login ${v ? "enabled" : "disabled"}`, "success");
                } catch {
                  toast("Autostart requires the desktop app", "warn");
                }
              }}
              isTauri={isTauri}
              onToggleWidget={() => invoke("toggle_widget").catch(() => toast("Widget is desktop-only", "warn"))}
              onLoadDemo={async () => { const r = await loadDemoData(); await refresh(); toast(`Demo content: ${r.cards} cards · ${r.reviews} reviews`, "success"); }}
              onClearAll={async () => { await clearAllCards(); await refresh(); toast("All data cleared", "warn"); }}
              onDedupe={async () => { const n = await deduplicateCards(); await refresh(); toast(n ? `Removed ${n} duplicates` : "No duplicates found", n ? "success" : "info"); }}
              onImportBookmarks={importBookmarks}
              onImportArticle={importArticle}
              chromeAvailable={chromeAvailable}
              airGestures={airGestures}
              onAirGestures={setAirGestures}
              cardCount={cards.length}
              reviewCount={reviews.length}
            />
          )}
        </main>

        <Inspector
          mode={inspectorMode}
          card={inspectorCard}
          lastReviewIso={reviewCard ? lastReview.get(reviewCard.id) : null}
          desiredRetention={desiredRetention}
          hintLevel={review?.hintLevel ?? 0}
          onHint={() => setReview((r) => (r ? { ...r, hintLevel: r.hintLevel + 1 } : r))}
          onReveal={(n) => { if (n > 0) setReview((r) => (r ? { ...r, shown: true, revealed: 999 } : r)); }}
          onEdit={(c) => setEditor({ card: c })}
          onDelete={view === "browse" ? (c) => void onDeleteCard(c) : undefined}
        />
      </div>

      {/* overlays */}
      <CommandBar open={cmdOpen} onClose={() => setCmdOpen(false)} cards={cards} groups={groups} actions={actions} onStudy={startReview} onOpenCard={(id) => { const c = cards.find((x) => x.id === id); if (c) setEditor({ card: c }); }} />
      <QuickCapture open={captureOpen} groups={groups.map((g) => g.full)} onClose={() => setCaptureOpen(false)} onSave={async (f, b, t) => { await createCard(decks[0]?.id ?? 1, f, b, t); await refresh(); toast("Card captured", "success"); }} />
      {editor && <EditorModal card={editor.card} deckId={decks[0]?.id ?? 1} onSave={saveCard} onClose={() => setEditor(null)} />}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      {celebration && <Celebration label={celebration} />}
      <Toasts toasts={toasts} onDone={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))} />
    </div>
  );
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  const groups = (["global", "review", "editor", "capture"] as const).map((s) => ({ scope: s, keys: scopeKeys(s) }));
  return (
    <div className="help-panel" role="dialog">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon name="keyboard" size={14} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Keyboard map</span>
        <button className="btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={onClose}><Icon name="x" size={12} /></button>
      </div>
      {groups.map((g) => (
        <div className="help-group" key={g.scope}>
          <div className="hg-label">{g.scope}</div>
          {g.keys.map((s) => (
            <div className="help-row" key={s.keys}>
              <span className="hr-key"><kbd className="keycap">{s.label}</kbd></span>
              <span className="hr-desc">{s.desc}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="hg-label" style={{ marginTop: 8 }}>gestures</div>
      <div className="help-row"><span className="hr-key"><kbd className="keycap">click</kbd></span><span className="hr-desc">Flip / reveal the card (also reverts)</span></div>
      <div className="help-row"><span className="hr-key"><kbd className="keycap">drag</kbd></span><span className="hr-desc">Card follows you — release past the glow to grade: ← Again · → Good · ↑ Easy · ↓ Hard (flick to flip before reveal)</span></div>
      <div className="help-row"><span className="hr-key"><kbd className="keycap">pinch</kbd></span><span className="hr-desc">Camera mode: thumb+index pinch flips the card</span></div>
      <div className="help-row"><span className="hr-key"><kbd className="keycap">swipe</kbd></span><span className="hr-desc">Camera mode: air-swipe left/right/up/down to grade — same mapping as drag</span></div>
      <div className="hg-label" style={{ marginTop: 8 }}>Tip</div>
      <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.6 }}>
        Space to reveal, <Keycap>G</Keycap> for cloze, <Keycap>1–4</Keycap> to grade, <Keycap>⇧G</Keycap> to undo a grade. The grading bar always predicts the FSRS interval before you press.
      </div>
    </div>
  );
}

function Celebration({ label }: { label: string }) {
  const confetti = useMemo(() => {
    const pieces: React.CSSProperties[] = [];
    const colors = ["var(--accent)", "var(--accent-2)", "var(--warning)", "var(--info)", "var(--danger)"];
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2;
      const dist = 60 + (i % 5) * 26;
      pieces.push({
        left: "50%",
        top: "50%",
        background: colors[i % colors.length],
        ["--dx" as string]: `${Math.cos(angle) * dist}px`,
        ["--rot" as string]: `${(i * 37) % 360}deg`,
      });
    }
    return pieces;
  }, []);
  return (
    <div className="celebrate">
      <div className="celebrate-ring" />
      <div className="celebrate-inner">
        <div className="cl-title">Queue complete</div>
        <div className="cl-sub">{label}</div>
      </div>
      {confetti.map((s, i) => <span key={i} className="confetti" style={s} />)}
    </div>
  );
}