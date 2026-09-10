import { useMemo } from "react";
import type { CardWithState, ReviewRow } from "../lib/types";
import { cardRetrievability, predictIntervals } from "../lib/fsrs";
import { Icon } from "./ui";

export type InspectorMode = "review" | "browse" | "idle";

type Props = {
  mode: InspectorMode;
  card: CardWithState | null;
  lastReviewIso?: string | null;
  desiredRetention: number;
  cardReviews: ReviewRow[];
  onEdit: (card: CardWithState) => void;
  onDelete?: (card: CardWithState) => void;
};

const GRADE_LABEL = ["Again", "Hard", "Good", "Easy"];

export function Inspector({ mode, card, lastReviewIso, desiredRetention, cardReviews, onEdit, onDelete }: Props) {
  const preds = useMemo(() => (card ? predictIntervals(card, desiredRetention) : []), [card, desiredRetention]);
  const rToday = useMemo(() => (card ? cardRetrievability(card, lastReviewIso) : null), [card, lastReviewIso]);
  const lapses = useMemo(() => cardReviews.filter((r) => r.grade === 1).length, [cardReviews]);
  const history = useMemo(() => [...cardReviews].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10), [cardReviews]);

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
                  FSRS projections, history and metadata appear here during review or browse.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="insp-section">
              <h4>Card</h4>
              <div className="insp-row"><span className="k">Status</span><span className="v"><span className={`chip ${card.state}`}>{card.state === "new" ? "New" : card.state === "learning" ? "Learning" : "Review"}</span></span></div>
              <div className="insp-row"><span className="k">Due</span><span className="v">{new Date(card.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>
              <div className="insp-row"><span className="k">Reps</span><span className="v">{card.reps}</span></div>
              <div className="insp-row"><span className="k">Lapses</span><span className="v" style={{ color: lapses >= 6 ? "var(--danger)" : undefined }}>{lapses}{lapses >= 6 ? " · leech" : ""}</span></div>
              <div className="insp-row"><span className="k">R(t) today</span><span className="v" style={{ color: rToday === null ? "var(--text-3)" : rToday >= 0.9 ? "var(--accent)" : rToday >= 0.8 ? "var(--warning)" : "var(--danger)" }}>{rToday === null ? "-" : `${Math.round(rToday * 100)}%`}</span></div>
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
                  New card. First grade will seed stability. Predictions appear after the first review.
                </div>
              ) : (
                <>
                  <div className="insp-row"><span className="k">Stability S</span><span className="v">{fmtDays(card.stability)}</span></div>
                  <div className="insp-row"><span className="k">Difficulty D</span><span className="v">{card.difficulty.toFixed(2)} <span style={{ color: "var(--text-3)", fontSize: 10 }}>(1 easy to 10 hard)</span></span></div>
                  <div className="insp-row"><span className="k">Target R</span><span className="v">{Math.round(desiredRetention * 100)}%</span></div>
                  <div className="insp-preds">
                    {preds.map((p) => (
                      <div key={p.key} className="insp-pred">
                        <span className={`chip grade-chip g${p.key}`}>{GRADE_LABEL[p.key - 1]}</span>
                        <span className="mono">{p.label}</span>
                        <span className="muted">{p.retention !== null ? fmtPct(p.retention) : "-"}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="insp-section">
              <h4>History</h4>
              {history.length === 0 ? (
                <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>No reviews yet.</div>
              ) : (
                <div className="insp-history">
                  {history.map((r) => (
                    <div key={r.id} className="insp-hist-row">
                      <span className={`chip grade-chip g${r.grade}`}>{GRADE_LABEL[r.grade - 1]}</span>
                      <span className="mono">{new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  ))}
                </div>
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

function fmtDays(d: number): string {
  if (d < 1) return `${Math.round(d * 24)}h`;
  if (d < 30) return `${d.toFixed(1)}d`;
  if (d < 400) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

function fmtPct(r: number | null): string {
  return r === null ? "-" : `${Math.round(r * 100)}%`;
}
