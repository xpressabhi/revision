import { useEffect, useMemo, useState } from "react";
import type { CardWithState, Grade } from "../lib/types";
import { cardRetrievability, predictIntervals } from "../lib/fsrs";
import { MarkdownView } from "../lib/markdown";
import { dragTransform, useDragGesture, type DragDir } from "../lib/gestures";
import { Icon, Keycap, fmtPct } from "./ui";

export type SessionStats = { answered: number; again: number; good: number; lapsed: number; startedAt: number };

type Props = {
  queue: CardWithState[];
  buried: Set<number>;
  idx: number;
  shown: boolean;
  revealed: number;
  lastReviewIso?: string | null;
  desiredRetention: number;
  onFlip: () => void;
  onGrade: (g: Grade) => void;
  onSkip: () => void;
  onUndo: () => void;
  onEdit: () => void;
  onSuspend: () => void;
  onBury: () => void;
  onEnd: () => void;
  canUndo: boolean;
  sessionStats: SessionStats;
  stale: boolean;
  onResume: () => void;
  onRestart: () => void;
  onReviewLapses: () => void;
};

export function ReviewView(p: Props) {
  const card = p.queue[p.idx] ?? null;
  const active = useMemo(() => p.queue.filter((c) => !p.buried.has(c.id)), [p.queue, p.buried]);
  const total = active.length;
  const done = p.sessionStats.answered;
  const [hoverZone, setHoverZone] = useState<Grade | null>(null);

  const segStats = useMemo(() => {
    const counts = { learning: 0, review: 0, new: 0 };
    for (const c of active) {
      if (c.state === "learning") counts.learning++;
      else if (c.state === "new") counts.new++;
      else counts.review++;
    }
    return counts;
  }, [active]);

  useEffect(() => {
    if (!p.shown) setHoverZone(null);
  }, [p.shown]);

  const drag = useDragGesture(p.shown, {
    onTap: () => actNow(() => p.onFlip()),
    onFlip: () => actNow(() => p.onFlip()),
    onGrade: (g) => actNow(() => p.onGrade(g)),
  });

  const act = (fn: () => void) => () => (p.stale ? p.onResume() : fn());
  const actNow = (fn: () => void) => {
    if (p.stale) p.onResume();
    else fn();
  };

  if (!card) {
    const elapsed = Math.max(0, Date.now() - p.sessionStats.startedAt);
    const minutes = Math.floor(elapsed / 60_000);
    const seconds = Math.floor((elapsed % 60_000) / 1000);
    const accuracy = p.sessionStats.answered > 0 ? Math.round(((p.sessionStats.answered - p.sessionStats.again) / p.sessionStats.answered) * 100) : 0;
    return (
      <div className="canvas-inner" style={{ maxWidth: 760, height: "100%", justifyContent: "center" }}>
        <div className="review-empty session-summary">
          <span className="big"><Icon name="check" size={34} /></span>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Session complete</div>
          <div className="summary-grid">
            <div className="summary-stat"><span className="k">{done}</span><span className="l">cards</span></div>
            <div className="summary-stat"><span className="k">{accuracy}%</span><span className="l">accuracy</span></div>
            <div className="summary-stat"><span className="k">{p.sessionStats.again}</span><span className="l">lapses</span></div>
            <div className="summary-stat"><span className="k">{minutes}:{String(seconds).padStart(2, "0")}</span><span className="l">time</span></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {p.sessionStats.lapsed > 0 && (
              <button className="btn btn-primary" onClick={p.onReviewLapses}>
                <Icon name="undo" size={13} /> Review lapses ({p.sessionStats.lapsed})
              </button>
            )}
            <button className="btn" onClick={p.onRestart}><Icon name="refresh" size={13} /> Study more</button>
            <button className="btn btn-ghost" onClick={p.onEnd}>Back to dashboard</button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 10 }}>
            <Keycap>⌘3</Keycap> restarts
          </div>
        </div>
      </div>
    );
  }

  const preds = predictIntervals(card, p.desiredRetention);
  const rToday = cardRetrievability(card, p.lastReviewIso);
  const hoverPred = hoverZone ? preds.find((x) => x.key === hoverZone) : null;
  const fsrsPred = preds.find((x) => x.key === 3);

  const gradeZones: { g: Grade; label: string; cls: string; arr: string }[] = [
    { g: 1, label: "Again", cls: "again", arr: "←" },
    { g: 2, label: "Hard", cls: "hard", arr: "↓" },
    { g: 3, label: "Good", cls: "good", arr: "→" },
    { g: 4, label: "Easy", cls: "easy", arr: "↑" },
  ];

  return (
    <div className="canvas-inner review-stage" style={{ maxWidth: 760, height: "100%", paddingTop: 6 }}>
      {/* session bar */}
      <div className="session-bar">
        <div className="session-meta">
          <span style={{ color: "var(--text-1)" }}>{Math.min(done + 1, total)} / {total}</span>
        </div>
        <div className="session-progress">
          {(["learning", "review", "new"] as const).map((s) => {
            const count = segStats[s];
            if (!count) return null;
            return <div key={s} className={`seg ${s}`} style={{ width: `${(count / Math.max(1, total)) * 100}%` }} />;
          })}
        </div>
        <div className="session-meta" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
          <span style={{ color: "var(--warning)" }}>L {segStats.learning}</span>
          <span style={{ color: "var(--accent)" }}>R {segStats.review}</span>
          <span style={{ color: "var(--info)" }}>N {segStats.new}</span>
        </div>
      </div>

      {/* card stage */}
      <div className="flip-wrap" {...drag.bind}>
        {p.stale && (
          <div
            className="stale-banner"
            role="button"
            tabIndex={0}
            onClick={p.onResume}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                p.onResume();
              }
            }}
          >
            <div className="stale-title"><Icon name="clock" size={14} /> Stepped away?</div>
            <div className="stale-sub">The answer is hidden. Recall it fresh. Your queue and progress are untouched until you resume.</div>
            <div className="stale-actions">
              <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); p.onResume(); }}>Resume</button>
              <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); p.onRestart(); }}>Restart queue</button>
              <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); p.onEnd(); }}>End</button>
            </div>
          </div>
        )}
        <div
          className={`flip-card ${p.shown ? "flipped" : ""} ${drag.state.phase === "dragging" ? "dragging" : ""} ${drag.state.phase === "flying" ? "flying" : ""}`}
          style={{ minHeight: 360, ...dragTransform(drag.state, p.shown) }}
        >
          {drag.state.phase !== "idle" && p.shown && (
            <SwipeBadges dir={drag.state.dir} phase={drag.state.phase} />
          )}
          {drag.state.phase === "dragging" && !p.shown && (
            <div className="swipe-reveal">
              <span>flip to reveal</span>
            </div>
          )}
          <div className="flip-face">
            <div className="face-label">
              <span>{card.deck_name}</span>
              {card.state === "new" && <span className="chip new"><Icon name="sparkles" size={9} /> new</span>}
            </div>
            <div className="face-body">
              <MarkdownView text={card.front} revealCloze={p.shown ? "all" : p.revealed} />
            </div>
            <div className="face-hint">
              {p.shown ? (
                <>
                  <Keycap>1-4</Keycap> grade, <Keycap>E</Keycap> edit, <Keycap>S</Keycap> suspend, <Keycap>B</Keycap> bury, <Keycap>⇧G</Keycap> undo
                  <span className="gesture-hint">, drag card to grade</span>
                </>
              ) : (
                <>
                  <Keycap>Space</Keycap> reveal answer
                  {hasCloze(card.front) && <><Keycap>G</Keycap> reveal next cloze ({p.revealed}/{clozeBlocks(card.front)})</>}
                  <span className="gesture-hint">, click card or flick it to flip</span>
                </>
              )}
            </div>
          </div>

          <div className="flip-face back">
            <div className="face-label">
              <span>Answer ({card.state === "review" ? `interval ${card.interval}d` : "reviewing"})</span>
            </div>
            <div className="face-body">
              {hasCloze(card.front) && <><MarkdownView text={card.front} revealCloze="all" /><div style={{ borderTop: "1px solid var(--hairline)", margin: "12px 0 0" }} /></>}
              <div style={{ paddingTop: hasCloze(card.front) ? 12 : 0 }}><MarkdownView text={card.back} /></div>
            </div>
            <div className="face-hint">
              <Keycap>1</Keycap> Again <Keycap>2</Keycap> Hard <Keycap>3</Keycap> Good <Keycap>4</Keycap> Easy. Hover any zone for the FSRS delta
            </div>
          </div>
        </div>
        <GesturePad shown={p.shown} onGrade={(g) => p.onGrade(g)} />
      </div>

      {/* grading bar */}
      <div>
        <div className="grade-readout">
          {hoverPred ? (
            <>
              If <b className={zoneCls(hoverZone!)}>{gradeZones.find((z) => z.g === hoverZone)?.label}</b> then interval <b>{hoverPred.label}</b>
              {hoverPred.retention !== null && <> with R at due <b>{fmtPct(hoverPred.retention)}</b></>}
              {hoverZone === 1 && <span>. Stability collapses, card restarts at 10m</span>}
            </>
          ) : (
            <>
              R(t) today <b className={rToday !== null && rToday < 0.8 ? "bad" : rToday !== null && rToday < 0.9 ? "warn" : ""}>{fmtPct(rToday)}</b>
              {fsrsPred && <> with Good at {fsrsPred.label}</>}
              <span style={{ color: "var(--text-4)" }}>(FSRS-5, target {Math.round(p.desiredRetention * 100)}%)</span>
            </>
          )}
        </div>
        <div className="grade-bar">
          {gradeZones.map((z) => {
            const pr = preds.find((x) => x.key === z.g)!;
            return (
              <button
                key={z.g}
                className={`grade-zone ${z.cls}`}
                onClick={act(() => p.onGrade(z.g))}
                onMouseEnter={() => setHoverZone(z.g)}
                onMouseLeave={() => setHoverZone(null)}
              >
                <span className="g-swipe" title={`drag/swipe ${z.arr}`}>{z.arr}</span>
                <span className="g-key">{z.g}</span>
                <span className="g-label">{z.label}</span>
                <span className="g-int">{pr.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
          <div style={{ display: "flex", gap: 14 }}>
            <button className="btn btn-ghost btn-sm" onClick={act(p.onUndo)} disabled={!p.canUndo} title="Undo last grade (⇧G)"><Icon name="undo" size={12} /> Undo</button>
            <button className="btn btn-ghost btn-sm" onClick={act(p.onSkip)} title="Skip (⌃→)"><Icon name="chevron" size={12} className="rv-skip" /> Skip</button>
            <button className="btn btn-ghost btn-sm" onClick={act(p.onEdit)} title="Edit (E)"><Icon name="card" size={12} /> Edit</button>
          </div>
          <div className="session-meta" style={{ fontSize: 10.5 }}>
            <button className="btn btn-ghost btn-sm" onClick={p.onBury} title="Bury until next session (B)">Bury</button>
            <button className="btn btn-ghost btn-sm" onClick={p.onSuspend} title="Suspend card (S)">Suspend</button>
            <button className="btn btn-ghost btn-sm" onClick={p.onEnd} title="End session (⌘↵)"><Icon name="x" size={11} /> End</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PAD_CELLS: { dir: DragDir; grade: number; label: string; cls: string; area: string }[] = [
  { dir: "up", grade: 4, label: "EASY", cls: "easy", area: "1 / 2" },
  { dir: "left", grade: 1, label: "AGAIN", cls: "again", area: "2 / 1" },
  { dir: "right", grade: 3, label: "GOOD", cls: "good", area: "2 / 3" },
  { dir: "down", grade: 2, label: "HARD", cls: "hard", area: "3 / 2" },
];

function GesturePad({ shown, onGrade }: { shown: boolean; onGrade: (g: Grade) => void }) {
  return (
    <div className="gesture-pad" role="group" aria-label="Gesture map. Swipe or drag the card in a direction to grade. Tap to flip">
      <div className="gp-grid">
        <div className="gp-center">
          <span>tap</span>
          <span className="gp-sub">flip</span>
        </div>
        {PAD_CELLS.map((c) => (
          <button
            key={c.dir}
            className={`gp-cell ${c.cls}`}
            style={{ gridArea: c.area }}
            title={`${c.label} (grade ${c.grade})`}
            onClick={() => onGrade(c.grade as Grade)}
          >
            <span className="gp-arrow">{c.dir === "up" ? "↑" : c.dir === "down" ? "↓" : c.dir === "left" ? "←" : "→"}</span>
            {c.label}
          </button>
        ))}
      </div>
      <span className="gp-caption">gestures{shown ? " (grade)" : " (tap to reveal)"}</span>
    </div>
  );
}

const BADGES: { dir: DragDir; grade: number; label: string; cls: string }[] = [
  { dir: "left", grade: 1, label: "AGAIN", cls: "again" },
  { dir: "right", grade: 3, label: "GOOD", cls: "good" },
  { dir: "up", grade: 4, label: "EASY", cls: "easy" },
  { dir: "down", grade: 2, label: "HARD", cls: "hard" },
];

function SwipeBadges({ dir, phase }: { dir: DragDir | null; phase: "dragging" | "flying" }) {
  return (
    <>
      {BADGES.map((b) => (
        <div key={b.dir} className={`swipe-badge ${b.cls} ${b.dir} ${dir === b.dir && phase === "dragging" ? "lit" : ""}`}>
          <span className="sb-arrow">{b.dir === "left" ? "←" : b.dir === "right" ? "→" : b.dir === "up" ? "↑" : "↓"}</span>
          {b.label}
        </div>
      ))}
    </>
  );
}

function hasCloze(front: string): boolean {
  return /\{\{c\d+::/.test(front);
}

function clozeBlocks(front: string): number {
  return (front.match(/\{\{c\d+::/g) ?? []).length;
}

function zoneCls(g: Grade): string {
  return g === 1 ? "bad" : g === 2 ? "warn" : "";
}
