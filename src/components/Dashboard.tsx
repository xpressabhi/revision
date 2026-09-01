import { useMemo, useState } from "react";
import type { CardWithState, ReviewRow } from "../lib/types";
import { buildTagTree, heatGrid, streakLength, retentionForecast, queueBuckets, type TagNode } from "../lib/derive";
import { Icon, Keycap, ProgressRing } from "./ui";

type Props = {
  cards: CardWithState[];
  reviews: ReviewRow[];
  lastReview: Map<number, string>;
  desiredRetention: number;
  onStudyGroup: (group: string) => void;
  onStudyAll: () => void;
  onBrowseGroup: (group: string) => void;
  onNewCard: () => void;
};

export function Dashboard({ cards, reviews, lastReview, desiredRetention, onStudyGroup, onStudyAll, onBrowseGroup, onNewCard }: Props) {
  const streak = useMemo(() => streakLength(reviews), [reviews]);
  const grid = useMemo(() => heatGrid(reviews), [reviews]);
  const groups = useMemo(() => buildTagTree(cards, lastReview), [cards, lastReview]);
  const forecast = useMemo(() => retentionForecast(cards, lastReview), [cards, lastReview]);
  const buckets = useMemo(() => queueBuckets(cards), [cards]);
  const dueNow = useMemo(() => cards.filter((c) => c.state !== "new" && new Date(c.due_at).getTime() <= Date.now() && !c.tags.includes("suspended")).length, [cards]);
  const totalReviews = reviews.length;

  return (
    <div className="canvas-inner">
      <div className="page-head">
        <div className="page-title">
          <Icon name="graph" size={19} /> Mastery Hub
          <span className="sub">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="chip" style={{ color: "var(--warning)" }}><Icon name="clock" size={11} /> {dueNow} due now</span>
          <button className="btn btn-primary" onClick={onStudyAll}><Icon name="bolt" size={13} /> Quick Study</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><span className="k accent">{streak}</span><span className="l">day streak</span></div>
        <div className="kpi"><span className="k">{totalReviews}</span><span className="l">reviews all-time</span></div>
        <div className="kpi"><span className="k">{cards.length}</span><span className="l">cards in decay curve</span></div>
        <div className="kpi"><span className="k">{Math.round(desiredRetention * 100)}%</span><span className="l">FSRS target retention</span></div>
      </div>

      <div className="heatmap">
        <div className="hm-head">
          <div style={{ fontWeight: 600, fontSize: 13 }}>Study Streak — last 53 weeks</div>
          <div className="hm-legend">
            less
            <i style={{ background: "var(--heat-0)" }} />
            <i style={{ background: "var(--heat-1)" }} />
            <i style={{ background: "var(--heat-2)" }} />
            <i style={{ background: "var(--heat-3)" }} />
            <i style={{ background: "var(--heat-4)" }} />
            more
          </div>
        </div>
        <div className="hm-scroll" style={{ overflowX: "auto", paddingBottom: 4 }}>
          <HeatmapGrid cells={grid.cells} />
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div style={{ fontWeight: 600, fontSize: 13 }}>Retention forecast</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>Average R(t) across all reviewed cards — dashed line is your target ({Math.round(desiredRetention * 100)}%)</div>
          <RetentionChart forecast={forecast} target={desiredRetention} />
        </div>
        <div className="chart-card">
          <div style={{ fontWeight: 600, fontSize: 13 }}>Forecast review queue</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>When cards will come due (learned cards only)</div>
          <QueueChart buckets={buckets} />
        </div>
      </div>

      <div>
        <div className="page-head" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Decks</div>
          <button className="btn btn-ghost btn-sm" onClick={onNewCard}><Icon name="plus" size={12} /> New card</button>
        </div>
        <div className="card-grid">
          {groups.filter((g) => !g.child).map((g, i) => (
            <DeckCard key={g.full} group={g} index={i} onStudy={() => onStudyGroup(g.full)} onBrowse={() => onBrowseGroup(g.full)} />
          ))}
          {groups.length === 0 && (
            <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
              <span className="es-ico"><Icon name="book" size={26} /></span>
              No decks yet — create a card or load demo content (Settings → Content).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeatmapGrid({ cells }: { cells: ReturnType<typeof heatGrid>["cells"] }) {
  const startDay = cells[0]?.date.getDay() ?? 0;
  const offset = (6 - startDay) % 7; // pad front so columns = weeks ending Saturday
  const n = cells.length + offset;
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div
      className="hm-grid"
      style={{ gridTemplateColumns: `repeat(${Math.ceil(n / 7)}, 10px)` }}
    >
      {cells.map((c, i) => {
        const pos = i + offset;
        const row = pos % 7;
        const col = Math.floor(pos / 7);
        const isToday = c.date.toDateString() === new Date().toDateString();
        return (
          <div
            key={i}
            className={`hm-cell ${isToday ? "today" : ""}`}
            data-l={c.level}
            style={{ gridRow: row + 1, gridColumn: col + 1 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <span className="hm-tip">
                {c.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {c.count} review{c.count === 1 ? "" : "s"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RetentionChart({ forecast, target }: { forecast: { day: number; r: number | null }[]; target: number }) {
  const W = 520;
  const H = 170;
  const PAD = { l: 30, r: 10, t: 10, b: 20 };
  const points = forecast.filter((p) => p.r !== null) as { day: number; r: number }[];
  const x = (d: number) => PAD.l + (d / 30) * (W - PAD.l - PAD.r);
  const y = (r: number) => H - PAD.b - ((Math.min(1, r) - 0.75) / 0.25) * (H - PAD.t - PAD.b);
  const line = points.map((p) => `${x(p.day)},${y(p.r)}`).join(" ");
  const area = `${x(0)},${H - PAD.b} ${line} ${x(30)},${H - PAD.b}`;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`}>
      {[0.75, 0.8, 0.85, 0.9, 0.95, 1.0].map((v) => (
        <g key={v}>
          <line className="grid-line" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} strokeWidth={0.7} />
          <text className="chart-label" x={4} y={y(v) + 3}>{Math.round(v * 100)}</text>
        </g>
      ))}
      <line className="chart-target" x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} strokeWidth={0.9} />
      <polygon className="chart-area" points={area} />
      <polyline className="chart-line" points={line} />
      {points.filter((_, i) => i % 5 === 0).map((p, i) => (
        <circle key={i} className="chart-dot" cx={x(p.day)} cy={y(p.r)} r={2} />
      ))}
      <text className="chart-label" x={x(0)} y={H - 5}>now</text>
      <text className="chart-label" x={x(30) - 14} y={H - 5}>30d</text>
    </svg>
  );
}

function QueueChart({ buckets }: { buckets: { label: string; count: number; days: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="queue-bars">
      {buckets.map((b) => (
        <div className="queue-bar" key={b.label}>
          <span className="lbl">{b.label}</span>
          <div className="track"><div className={`fill ${b.days <= 1 ? "danger" : b.days <= 3 ? "warn" : ""}`} style={{ width: `${(b.count / max) * 100}%` }} /></div>
          <span className="val">{b.count}</span>
        </div>
      ))}
    </div>
  );
}

function DeckCard({ group, index, onStudy, onBrowse }: { group: TagNode; index: number; onStudy: () => void; onBrowse: () => void }) {
  const pct = group.total ? Math.min(1, (group.total - group.newCount) / group.total) : 0;
  return (
    <div className="deck-card" style={{ animationDelay: `${index * 40}ms` }} onClick={onBrowse}>
      <div className="dc-top">
        <ProgressRing pct={pct} size={46}>
          <span>{group.due > 0 ? group.due : "✓"}</span>
        </ProgressRing>
        <div className="dc-info">
          <div className="dc-name ellipsis">{group.root}</div>
          <div className="dc-meta">
            <span>{group.total} cards · {group.total - group.newCount - group.learning} mature</span>
            <span>R avg {group.rAvg !== null ? Math.round(group.rAvg * 100) : "—"}%</span>
          </div>
        </div>
      </div>
      <div className="dc-bottom">
        <div className="dc-stats">
          <span className="stat"><Icon name="clock" size={10} /> {group.due} due</span>
          {group.newCount > 0 && <span className="stat"><Icon name="sparkles" size={10} /> {group.newCount} new</span>}
        </div>
        <button className="btn btn-sm btn-primary dc-quick" onClick={(e) => { e.stopPropagation(); onStudy(); }}>
          <Icon name="bolt" size={11} /> Quick Study
        </button>
      </div>
      <span className="chip new" style={{ position: "absolute", top: 12, right: 12, opacity: group.newCount ? 1 : 0 }}>
        <Icon name="sparkles" size={9} /> {group.newCount}
      </span>
    </div>
  );
}

export function ShortcutHint() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11, color: "var(--text-3)", padding: "0 2px" }}>
      <span><Keycap>⌘K</Keycap> anything</span>
      <span><Keycap>⌘3</Keycap> review</span>
      <span><Keycap>Space</Keycap> reveal</span>
      <span><Keycap>1–4</Keycap> grade</span>
    </div>
  );
}