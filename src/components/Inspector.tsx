import { useMemo } from "react";
import type { CardWithState } from "../lib/types";
import { cardRetrievability, nextState, type IntervalPrediction } from "../lib/fsrs";
import { hintQueueFor } from "../lib/ai";
import { Icon } from "./ui";

export type InspectorMode = "review" | "browse" | "idle";

type Props = {
  mode: InspectorMode;
  card: CardWithState | null;
  lastReviewIso?: string | null;
  desiredRetention: number;
  hintLevel: number;
  onHint: () => void;
  onReveal: (n: number) => void;
  onEdit: (card: CardWithState) => void;
  onDelete?: (card: CardWithState) => void;
};

export function Inspector({ mode, card, lastReviewIso, desiredRetention, hintLevel, onHint, onReveal, onEdit, onDelete }: Props) {
  const hints = useMemo(() => (card ? hintQueueFor(card.front, card.front, card.back) : []), [card]);

  const scenario = useMemo<{ preds: IntervalPrediction[]; curves: { grade: number; d: number; r: number | null }[] | null }>(() => {
    if (!card || card.state === "new") return { preds: [], curves: null };
    const st = {
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
    const preds = [1, 2, 3, 4].map((g) => {
      const ns = nextState(st, g as 1 | 2 | 3 | 4, new Date(), desiredRetention);
      const days = ns.state === "learning" ? 10 / 60 / 24 : (new Date(ns.due_at).getTime() - Date.now()) / 86_400_000;
      return { key: g as 1 | 2 | 3 | 4, label: fmt(days), days, retention: ns.stability > 0 ? Math.pow(1 + (19 / 81) * (days / ns.stability), -0.5) : null };
    });
    const curves: { grade: number; d: number; r: number | null }[] = [];
    for (const p of preds) {
      const ns = nextState(st, p.key, new Date(), desiredRetention);
      for (let d = 0; d <= 30; d += 5) {
        curves.push({ grade: p.key, d, r: ns.stability > 0 ? Math.pow(1 + (19 / 81) * (d / ns.stability), -0.5) : null });
      }
    }
    return { preds, curves };
  }, [card, desiredRetention]);

  const rToday = useMemo(() => (card ? cardRetrievability(card, lastReviewIso) : null), [card, lastReviewIso]);

  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="insp-scroll">
        {mode === "idle" || !card ? (
          <div className="insp-empty">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <Icon name="panel" size={22} />
              <div>
                Inspector
                <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 4 }}>
                  FSRS projections, metadata and AI hints appear here during review or browse.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {mode === "review" && (
              <div className="insp-section">
                <h4>AI Hint Generator</h4>
                <div className="insp-hint">
                  {hints.slice(0, Math.max(0, hintLevel)).map((h, i) => (
                    <div key={i} className="hint-text">{h}</div>
                  ))}
                  {hintLevel === 0 && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Stuck? Press <b>H</b> to reveal the first hint — each press deepens it.</div>}
                </div>
                <button className="btn btn-sm" onClick={onHint}>
                  <Icon name="sparkles" size={12} /> Reveal hint {hintLevel < hints.length ? `(${hintLevel + 1}/${hints.length})` : ""}
                </button>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => onReveal(999)}>
                    <Icon name="check" size={12} /> Show answer
                  </button>
                </div>
              </div>
            )}

            <div className="insp-section">
              <h4>Card</h4>
              <div className="insp-row"><span className="k">Status</span><span className="v"><span className={`chip ${card.state}`}>{card.state === "new" ? "New" : card.state === "learning" ? "Learning" : "Review"}</span></span></div>
              <div className="insp-row"><span className="k">Due</span><span className="v">{new Date(card.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>
              <div className="insp-row"><span className="k">Reps</span><span className="v">{card.reps}</span></div>
              <div className="insp-row"><span className="k">R(t) today</span><span className="v" style={{ color: rToday === null ? "var(--text-3)" : rToday >= 0.9 ? "var(--accent)" : rToday >= 0.8 ? "var(--warning)" : "var(--danger)" }}>{rToday === null ? "—" : `${Math.round(rToday * 100)}%`}</span></div>
              {card.tags && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {card.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                    <span key={t} className="chip tag">{t}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="insp-section">
              <h4>FSRS Projection</h4>
              {(card.state === "new" || card.stability <= 0) ? (
                <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
                  New card — first grade will seed stability. Predictions appear after the first review.
                </div>
              ) : (
                <>
                  <div className="insp-row"><span className="k">Stability S</span><span className="v">{fmtDays(card.stability)}</span></div>
                  <div className="insp-row"><span className="k">Difficulty D</span><span className="v">{card.difficulty.toFixed(2)} <span style={{ color: "var(--text-3)", fontSize: 10 }}>(1 easy → 10 hard)</span></span></div>
                  <div className="insp-row"><span className="k">Target R</span><span className="v">{Math.round(desiredRetention * 100)}%</span></div>
                  {scenario.curves && <ScenarioChart curves={scenario.curves} preds={scenario.preds} />}
                  <div style={{ fontSize: 10.5, color: "var(--text-4)", lineHeight: 1.5 }}>
                    R(t) = (1 + 19/81 · t/S)<sup>−0.5</sup> — projected retention if you grade Now (1), Hard (2), Good (3) or Easy (4). FSRS-5 weights.
                  </div>
                </>
              )}
            </div>

            <div className="insp-section">
              <div style={{ display: "flex", gap: 6, flexDirection: "column" }}>
                <button className="btn btn-sm" onClick={() => onEdit(card)}><Icon name="card" size={12} /> Edit card</button>
                {onDelete && (
                  <button className="btn btn-sm btn-danger" onClick={() => onDelete(card)}><Icon name="trash" size={12} /> Delete card</button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function ScenarioChart({ curves, preds }: { curves: { grade: number; d: number; r: number | null }[]; preds: IntervalPrediction[] }) {
  const W = 248;
  const H = 74;
  const PAD = 6;
  const colors = ["#f26d6d", "#f5a524", "var(--accent)", "#4ea1ff"];
  const maxD = 30;
  const series = [1, 2, 3, 4].map((g) => curves.filter((c) => c.grade === g));
  const x = (d: number) => PAD + (d / maxD) * (W - PAD * 2);
  const y = (r: number | null) => H - PAD - (r === null ? 0 : Math.max(0, Math.min(1, r)) * (H - PAD * 2));
  return (
    <svg className="chart" width="100%" viewBox={`0 0 ${W} ${H}`}>
      {[0.8, 0.9, 1.0].map((v) => (
        <line key={v} className="grid-line" x1={0} x2={W} y1={y(v)} y2={y(v)} strokeWidth={0.6} />
      ))}
      <line className="chart-target" x1={0} x2={W} y1={y(0.9)} y2={y(0.9)} strokeWidth={0.8} />
      {series.map((pts, gi) => (
        <polyline
          key={gi}
          fill="none"
          stroke={colors[gi]}
          strokeWidth={1.1}
          opacity={0.75}
          points={pts.map((p) => `${x(p.d)},${y(p.r)}`).join(" ")}
        />
      ))}
      {preds.map((p, i) => (
        <circle key={i} cx={x(Math.min(maxD, p.days))} cy={y(p.retention)} r={2.2} fill={colors[i]} stroke="var(--bg)" strokeWidth={1} />
      ))}
      <text className="chart-label" x={0} y={H - 1}>d0</text>
      <text className="chart-label" x={W - 10} y={H - 1}>30d</text>
    </svg>
  );
}

function fmtDays(d: number): string {
  if (d < 1) return `${Math.round(d * 24)}h`;
  if (d < 30) return `${d.toFixed(1)}d`;
  if (d < 400) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

function fmt(d: number): string {
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 1440))}m`;
  if (d < 1) return `${Math.max(1, Math.round(d * 24))}h`;
  if (d < 30) return `${Math.round(d)}d`;
  return `${Math.round(d / 30)}mo`;
}