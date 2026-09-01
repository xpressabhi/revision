import { useEffect, useMemo, useState } from "react";
import type { CardWithState, Grade } from "../lib/types";
import { cardRetrievability, predictIntervals } from "../lib/fsrs";
import { MarkdownView } from "../lib/markdown";
import { dragTransform, useDragGesture, type DragDir } from "../lib/gestures";
import { HandOverlay } from "./HandOverlay";
import { Icon, Keycap, fmtPct } from "./ui";

export type Pomo = { seconds: number; running: boolean; mode: "focus" | "break" };

type Props = {
  queue: CardWithState[];
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
  pomo: Pomo;
  onPomoToggle: () => void;
  onPomoSkip: () => void;
  onPomoReset: () => void;
  canUndo: boolean;
  sessionStats: { answered: number; again: number; good: number };
  airGestures: boolean;
};

export function ReviewView(p: Props) {
  const card = p.queue[p.idx] ?? null;
  const total = p.queue.length;
  const done = p.sessionStats.answered;
  const [hoverZone, setHoverZone] = useState<Grade | null>(null);

  const segStats = useMemo(() => {
    const counts = { learning: 0, review: 0, new: 0 };
    for (const c of p.queue) {
      if (c.state === "learning") counts.learning++;
      else if (c.state === "new") counts.new++;
      else counts.review++;
    }
    return counts;
  }, [p.queue]);

  useEffect(() => {
    if (!p.shown) setHoverZone(null);
  }, [p.shown]);

  const drag = useDragGesture(p.shown, {
    onTap: () => p.onFlip(),
    onFlip: () => p.onFlip(),
    onGrade: (g) => p.onGrade(g),
  });

  if (!card) {
    return (
      <div className="canvas-inner" style={{ maxWidth: 760, height: "100%", justifyContent: "center" }}>
        <div className="review-empty">
          <span className="big"><Icon name="wink" size={40} /></span>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Session complete</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            {done} cards reviewed · {p.sessionStats.good} good grades · {p.sessionStats.again} lapses
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={p.onEnd}><Icon name="check" size={13} /> Back to dashboard</button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 10 }}>
            New cards are capped at 20 per session · <Keycap>⌘3</Keycap> restarts
          </div>
        </div>
      </div>
    );
  }

  const preds = predictIntervals(card, p.desiredRetention);
  const rToday = cardRetrievability(card, p.lastReviewIso);
  const hoverPred = hoverZone ? preds.find((x) => x.key === hoverZone) : null;
  const fsrsPred = preds.find((x) => x.key === 3);

  const gradeZones: { g: Grade; label: string; cls: string }[] = [
    { g: 1, label: "Again", cls: "again" },
    { g: 2, label: "Hard", cls: "hard" },
    { g: 3, label: "Good", cls: "good" },
    { g: 4, label: "Easy", cls: "easy" },
  ];

  return (
    <div className="canvas-inner review-stage" style={{ maxWidth: 760, height: "100%", paddingTop: 6 }}>
      {/* session bar */}
      <div className="session-bar">
        <div className="session-meta">
          <span style={{ color: "var(--text-1)" }}>{Math.min(p.idx + 1, total)} / {total}</span>
        </div>
        <div className="session-progress">
          {(["learning", "review", "new"] as const).map((s) => {
            const count = segStats[s];
            if (!count) return null;
            return <div key={s} className={`seg ${s}`} style={{ width: `${(count / Math.max(1, total)) * 100}%` }} />;
          })}
        </div>
        <div className="session-meta" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
          <span style={{ color: "var(--warning)" }}>● L {segStats.learning}</span>
          <span style={{ color: "var(--accent)" }}>● R {segStats.review}</span>
          <span style={{ color: "var(--accent-2)" }}>● N {segStats.new}</span>
        </div>
        <PomoButton pomo={p.pomo} onToggle={p.onPomoToggle} onSkip={p.onPomoSkip} onReset={p.onPomoReset} />
      </div>

      {/* card stage */}
      <div className="flip-wrap" {...drag.bind}>
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
              <span>{card.deck_name} · {card.tags.split(">")[0]}</span>
              {card.state === "new" && <span className="chip new"><Icon name="sparkles" size={9} /> new</span>}
            </div>
            <div className="face-body">
              <MarkdownView text={card.front} revealCloze={p.shown ? "all" : p.revealed} />
            </div>
            <div className="face-hint">
              {p.shown ? (
                <>
                  <Keycap>1–4</Keycap> grade · <Keycap>E</Keycap> edit · <Keycap>S</Keycap> suspend · <Keycap>B</Keycap> bury · <Keycap>⇧G</Keycap> undo
                  <span className="gesture-hint">· drag card ←→↑↓ to grade</span>
                </>
              ) : (
                <>
                  <Keycap>Space</Keycap> reveal answer
                  {hasCloze(card.front) && <><span style={{ opacity: 0.5 }}>·</span><Keycap>G</Keycap> reveal next cloze ({p.revealed}/{clozeBlocks(card.front)})</>}
                  <span className="gesture-hint">· click card or flick it to flip</span>
                </>
              )}
            </div>
          </div>

          <div className="flip-face back">
            <div className="face-label">
              <span>Answer · {card.state === "review" ? `interval ${card.interval}d` : "reviewing"}</span>
            </div>
            <div className="face-body">
              {hasCloze(card.front) && <><MarkdownView text={card.front} revealCloze="all" /><div style={{ borderTop: "1px solid var(--hairline)", margin: "12px 0 0" }} /></>}
              <div style={{ paddingTop: hasCloze(card.front) ? 12 : 0 }}><MarkdownView text={card.back} /></div>
            </div>
            <div className="face-hint">
              <Keycap>1</Keycap> Again <Keycap>2</Keycap> Hard <Keycap>3</Keycap> Good <Keycap>4</Keycap> Easy — hover any zone for the FSRS delta
            </div>
          </div>
        </div>
        {p.airGestures && <HandOverlay shown={p.shown} onFlip={p.onFlip} onGrade={(g) => p.onGrade(g)} />}
      </div>

      {/* grading bar */}
      <div>
        <div className="grade-readout">
          {hoverPred ? (
            <>
              If <b className={zoneCls(hoverZone!)}>{gradeZones.find((z) => z.g === hoverZone)?.label}</b> → interval <b>{hoverPred.label}</b>
              {hoverPred.retention !== null && <> · R at due <b>{fmtPct(hoverPred.retention)}</b></>}
              {hoverZone === 1 && <span> — stability collapses, card restarts at 10m</span>}
            </>
          ) : (
            <>
              R(t) today <b className={rToday !== null && rToday < 0.8 ? "bad" : rToday !== null && rToday < 0.9 ? "warn" : ""}>{fmtPct(rToday)}</b>
              {fsrsPred && <> · Good → {fsrsPred.label}</>}
              <span style={{ color: "var(--text-4)" }}>· FSRS-5 · target {Math.round(p.desiredRetention * 100)}%</span>
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
                onClick={() => p.onGrade(z.g)}
                onMouseEnter={() => setHoverZone(z.g)}
                onMouseLeave={() => setHoverZone(null)}
              >
                <span className="g-key">{z.g}</span>
                <span className="g-label">{z.label}</span>
                <span className="g-int">{pr.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
          <div style={{ display: "flex", gap: 14 }}>
            <button className="btn btn-ghost btn-sm" onClick={p.onUndo} disabled={!p.canUndo} title="Undo last grade (⇧G)"><Icon name="undo" size={12} /> Undo</button>
            <button className="btn btn-ghost btn-sm" onClick={p.onSkip} title="Skip (⌃→)"><Icon name="chevron" size={12} className="rv-skip" /> Skip</button>
            <button className="btn btn-ghost btn-sm" onClick={p.onEdit} title="Edit (E)"><Icon name="card" size={12} /> Edit</button>
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

function PomoButton({ pomo, onToggle, onSkip, onReset }: { pomo: Pomo; onToggle: () => void; onSkip: () => void; onReset: () => void }) {
  const mm = String(Math.floor(pomo.seconds / 60)).padStart(2, "0");
  const ss = String(pomo.seconds % 60).padStart(2, "0");
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <button className={`pomo mono ${pomo.running ? "running" : ""}`} onClick={onToggle} title={pomo.running ? "Pause timer" : "Start timer"}>
        {pomo.mode === "focus" ? <Icon name="clock" size={12} /> : <Icon name="check" size={12} />}
        {mm}:{ss}
      </button>
      <button className="btn-ghost btn-sm" style={{ height: 24, padding: "0 6px", fontSize: 10 }} onClick={onSkip} title="Skip phase">⏭</button>
      <button className="btn-ghost btn-sm" style={{ height: 24, padding: "0 6px", fontSize: 10 }} onClick={onReset} title="Reset timer">↺</button>
    </div>
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