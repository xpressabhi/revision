import { useMemo, useState } from "react";
import type { CardWithState } from "../lib/types";
import type { TagNode } from "../lib/derive";
import { smartFilterCount, type StudyScope } from "../lib/derive";
import { Icon } from "./ui";

type Props = {
  groups: TagNode[];
  cards: CardWithState[];
  lastReview: Map<number, string>;
  rail: boolean;
  activeGroup: string | null;
  activeSmart: string | null;
  onGroup: (full: string | null) => void;
  onSmart: (id: string) => void;
  onStudy: (scope: StudyScope) => void;
  onNewCard: () => void;
  onView: (v: "dashboard" | "analytics") => void;
  toggleFocus: () => void;
  reviewActive: boolean;
};

export function Sidebar({ groups, cards, lastReview, rail, activeGroup, activeSmart, onGroup, onSmart, onStudy, onNewCard, onView, toggleFocus, reviewActive }: Props) {
  const [openRoots, setOpenRoots] = useState<Set<string>>(new Set());

  const roots = useMemo(() => groups.filter((g) => !g.child), [groups]);
  const smart = useMemo(() => {
    const d = smartFilterCount(cards, "due", lastReview);
    const n = smartFilterCount(cards, "new", lastReview);
    const l = smartFilterCount(cards, "learning", lastReview);
    const s = smartFilterCount(cards, "stuck", lastReview);
    return [
      { id: "due", label: "Due now", ico: "clock" as const, count: d, tone: d > 0 ? "due" as const : null },
      { id: "stuck", label: "Stuck < 80%", ico: "warn" as const, count: s, tone: s > 0 ? "due" as const : null },
      { id: "learning", label: "Learning", ico: "bolt" as const, count: l, tone: "learning" as const },
      { id: "new", label: "New cards", ico: "sparkles" as const, count: n, tone: "new" as const },
    ];
  }, [cards, lastReview]);

  const dim = rail;

  return (
    <aside className="sidebar" aria-label="Navigation">
      <div className="sb-scroll">
        {!dim && (
          <div className="sb-section">
            <div className="sb-label">Study</div>
            <div className={`sb-item ${reviewActive ? "active" : ""}`} onClick={() => onStudy({ kind: "all" })}>
              <span className="sb-ico"><Icon name="bolt" /></span>
              <span>Start Review</span>
              {smart[0].count > 0 && <span className="sb-count">{smart[0].count}</span>}
            </div>
            {smart.map((f) => (
              <div
                key={f.id}
                className={`sb-item ${activeSmart === f.id ? "active" : ""}`}
                onClick={() => onSmart(f.id)}
                title={`${f.label}: ${f.count} cards`}
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
                    onClick={() => {
                      if (kids.length) setOpenRoots((s) => { const n = new Set(s); if (n.has(root.root)) n.delete(root.root); else n.add(root.root); return n; });
                      onGroup(root.full);
                    }}
                    title={`${root.full}: ${root.total} cards, ${root.due} due`}
                  >
                    {kids.length > 0 && <span className="sb-caret"><Icon name="chevron" size={10} /></span>}
                    <span className="sb-ico"><Icon name="book" /></span>
                    <span>{root.full}</span>
                    {root.due > 0 && <span className="sb-count">{root.due}</span>}
                  </div>
                  {open &&
                    kids.map((k) => (
                      <div key={k.full} className={`sb-item sb-tree ${activeGroup === k.full ? "active" : ""}`} onClick={() => onGroup(k.full)} title={`${k.full}: ${k.total} cards, ${k.due} due`}>
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
            <div className="sb-label">Tag Graph</div>
            <TagGraph groups={groups} onPick={(full) => onGroup(full)} onStudy={() => onStudy({ kind: "all" })} />
          </div>
        )}

        {!dim && (
          <div className="sb-section">
            <div className="sb-label">Overview</div>
            <div className="sb-item" onClick={() => onView("dashboard")}><span className="sb-ico"><Icon name="graph" /></span><span>Dashboard</span></div>
            <div className="sb-item" onClick={() => onView("analytics")}><span className="sb-ico"><Icon name="chart" /></span><span>Study Analytics</span></div>
          </div>
        )}
      </div>

      <div className="sb-foot">
        {!dim && (
          <div className="sb-item" onClick={onNewCard}>
            <span className="sb-ico"><Icon name="plus" /></span>
            <span>New card</span>
          </div>
        )}
        <div className="sb-item" onClick={toggleFocus} title="Focus mode (⌘⇧F)">
          <span className="sb-ico"><Icon name="focus" /></span>
          <span>Focus mode</span>
        </div>
      </div>
    </aside>
  );
}

/** Minimal co-occurrence tag graph: nodes sized by card count, edges = shared cards. */
function TagGraph({ groups, onPick, onStudy }: { groups: TagNode[]; onPick: (full: string) => void; onStudy: () => void }) {
  const top = useMemo(() => groups.slice(0, 9), [groups]);
  const W = 176;
  const H = 108;
  const nodes = useMemo(() => {
    if (!top.length) return [];
    const max = Math.max(...top.map((t) => t.total));
    return top.map((t, i) => {
      const angle = (i / top.length) * Math.PI * 2 - Math.PI / 2;
      const rad = 34 + (t.total / max) * 8;
      return {
        ...t,
        x: W / 2 + Math.cos(angle) * rad,
        y: H / 2 + Math.sin(angle) * rad,
        r: 7 + (t.total / max) * 7,
      };
    });
  }, [top]);

  if (!top.length) {
    return (
      <div className="tag-graph" style={{ padding: 18, fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>
        No tags yet. Create cards or load demo content.
      </div>
    );
  }

  return (
    <div className="tag-graph" style={{ position: "relative" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {nodes.map((n, i) =>
          nodes.slice(i + 1).map((m, j) => (
            <line key={`${i}-${j}`} className="tg-edge" x1={n.x} y1={n.y} x2={m.x} y2={m.y} strokeWidth={0.5} opacity={0.35} />
          )),
        )}
        {nodes.map((n) => (
          <g key={n.full} className="tg-node" onClick={() => onPick(n.full)} style={{ cursor: "pointer" }}>
            <circle cx={n.x} cy={n.y} r={n.r} fill="var(--accent-dim)" stroke="var(--accent-glow)" strokeWidth={1} />
            <text className="tg-label" x={n.x} y={n.y + 2.5} textAnchor="middle">{n.root.slice(0, 10)}</text>
          </g>
        ))}
      </svg>
      <button
        onClick={onStudy}
        style={{ position: "absolute", right: 6, top: 6, fontSize: 10, color: "var(--accent)", fontWeight: 600 }}
        title="Study everything"
      >
        Study all
      </button>
    </div>
  );
}