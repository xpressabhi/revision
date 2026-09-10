import { useMemo, useState } from "react";
import type { CardWithState } from "../lib/types";
import type { TagNode } from "../lib/derive";
import { smartFilterCount, type StudyScope } from "../lib/derive";
import { Icon } from "./ui";

type Props = {
  groups: TagNode[];
  cards: CardWithState[];
  lastReview: Map<number, string>;
  lapses: Map<number, number>;
  rail: boolean;
  activeGroup: string | null;
  onGroup: (full: string | null) => void;
  onSmart: (id: string) => void;
  onStudy: (scope: StudyScope) => void;
  onNewCard: () => void;
  onView: (v: "dashboard" | "analytics") => void;
  toggleFocus: () => void;
  reviewActive: boolean;
};

function itemProps(fn: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    },
  };
}

export function Sidebar({ groups, cards, lastReview, lapses, rail, activeGroup, onGroup, onSmart, onStudy, onNewCard, onView, toggleFocus, reviewActive }: Props) {
  const [openRoots, setOpenRoots] = useState<Set<string>>(new Set());

  const roots = useMemo(() => groups.filter((g) => !g.child), [groups]);
  const smart = useMemo(() => {
    const d = smartFilterCount(cards, "due", lastReview, lapses);
    const n = smartFilterCount(cards, "new", lastReview, lapses);
    const l = smartFilterCount(cards, "learning", lastReview, lapses);
    const s = smartFilterCount(cards, "stuck", lastReview, lapses);
    const le = smartFilterCount(cards, "leeches", lastReview, lapses);
    return [
      { id: "due", label: "Due now", ico: "clock" as const, count: d, tone: d > 0 ? "due" as const : null },
      { id: "stuck", label: "Stuck < 80%", ico: "warn" as const, count: s, tone: s > 0 ? "due" as const : null },
      { id: "leeches", label: "Leeches", ico: "flame" as const, count: le, tone: le > 0 ? "due" as const : null },
      { id: "learning", label: "Learning", ico: "bolt" as const, count: l, tone: "learning" as const },
      { id: "new", label: "New cards", ico: "sparkles" as const, count: n, tone: "new" as const },
    ];
  }, [cards, lastReview, lapses]);

  const dim = rail;

  return (
    <aside className="sidebar" aria-label="Navigation">
      <div className="sb-scroll">
        {!dim && (
          <div className="sb-section">
            <div className="sb-label">Study</div>
            <div className={`sb-item ${reviewActive ? "active" : ""}`} {...itemProps(() => onStudy({ kind: "all" }))}>
              <span className="sb-ico"><Icon name="bolt" /></span>
              <span>Start Review</span>
              {smart[0].count > 0 && <span className="sb-count">{smart[0].count}</span>}
            </div>
            {smart.map((f) => (
              <div
                key={f.id}
                className="sb-item"
                title={`${f.label}: ${f.count} cards`}
                {...itemProps(() => onSmart(f.id))}
              >
                <span className="sb-ico"><Icon name={f.ico} /></span>
                <span>{f.label}</span>
                <span className="sb-count" style={{ color: f.tone === "due" ? "var(--danger)" : f.tone === "learning" ? "var(--warning)" : undefined }}>{f.count}</span>
              </div>
            ))}
          </div>
        )}

        {!dim && (
          <div className="sb-section">
            <div className="sb-label">Decks</div>
            {roots.map((root) => {
              const kids = groups.filter((g) => g.root === root.root && g.child);
              const open = openRoots.has(root.root);
              const active = activeGroup === root.full;
              return (
                <div key={root.full}>
                  <div
                    className={`sb-item has-children ${open ? "open" : ""} ${active ? "active" : ""}`}
                    title={`${root.full}: ${root.total} cards, ${root.due} due`}
                    {...itemProps(() => {
                      if (kids.length) setOpenRoots((s) => { const n = new Set(s); if (n.has(root.root)) n.delete(root.root); else n.add(root.root); return n; });
                      onGroup(root.full);
                    })}
                  >
                    {kids.length > 0 && <span className="sb-caret"><Icon name="chevron" size={10} /></span>}
                    <span className="sb-ico"><Icon name="book" /></span>
                    <span>{root.full}</span>
                    {root.due > 0 && <span className="sb-count">{root.due}</span>}
                  </div>
                  {open &&
                    kids.map((k) => (
                      <div key={k.full} className={`sb-item sb-tree ${activeGroup === k.full ? "active" : ""}`} title={`${k.full}: ${k.total} cards, ${k.due} due`} {...itemProps(() => onGroup(k.full))}>
                        <span className="sb-ico"><Icon name="layers" size={12} /></span>
                        <span>{k.child}</span>
                        {k.due > 0 && <span className="sb-count">{k.due}</span>}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        )}

        {!dim && (
          <div className="sb-section">
            <div className="sb-label">Overview</div>
            <div className="sb-item" {...itemProps(() => onView("dashboard"))}><span className="sb-ico"><Icon name="graph" /></span><span>Dashboard</span></div>
            <div className="sb-item" {...itemProps(() => onView("analytics"))}><span className="sb-ico"><Icon name="chart" /></span><span>Study Analytics</span></div>
          </div>
        )}
      </div>

      <div className="sb-foot">
        {!dim && (
          <div className="sb-item" {...itemProps(onNewCard)}>
            <span className="sb-ico"><Icon name="plus" /></span>
            <span>New card</span>
          </div>
        )}
        <div className="sb-item" title="Focus mode (⌘⇧F)" {...itemProps(toggleFocus)}>
          <span className="sb-ico"><Icon name="focus" /></span>
          <span>Focus mode</span>
        </div>
      </div>
    </aside>
  );
}
