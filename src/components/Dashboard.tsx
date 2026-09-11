import { useMemo, useState } from "react";
import type { CardWithState, ReviewRow } from "../lib/types";
import { heatGrid, streakLength, retentionForecast, type TagNode } from "../lib/derive";
import { Icon, ProgressRing } from "./ui";

type Props = {
  cards: CardWithState[];
  reviews: ReviewRow[];
  groups: TagNode[];
  lastReview: Map<number, string>;
  desiredRetention: number;
  newPerDay: number;
  onStudyGroup: (group: string) => void;
  onStudyAll: () => void;
  onBrowseGroup: (group: string) => void;
  onNewCard: () => void;
  getStarted?: { done: number; total: number; onOpen: () => void; onDismiss: () => void };
  onOpenGuide?: () => void;
};

export function Dashboard({ cards, reviews, groups, lastReview, desiredRetention, newPerDay, onStudyGroup, onStudyAll, onBrowseGroup, onNewCard, getStarted, onOpenGuide }: Props) {
  const streak = useMemo(() => streakLength(reviews), [reviews]);
  const grid = useMemo(() => heatGrid(reviews), [reviews]);
  const forecast = useMemo(() => retentionForecast(cards, lastReview), [cards, lastReview]);
  const dueNow = useMemo(() => cards.filter((c) => c.state !== "new" && new Date(c.due_at).getTime() <= Date.now() && !c.tags.includes("suspended")).length, [cards]);

  return (
    <div className="canvas-inner">
      <div className="page-head">
        <div className="page-title">
          <Icon name="graph" size={19} /> Study
          <span className="sub">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-primary" onClick={onStudyAll}><Icon name="bolt" size={13} /> Study {dueNow > 0 ? `${dueNow} due` : "all"}</button>
        </div>
      </div>

      {getStarted && (
        <div className="getstarted-banner">
          <Icon name="sparkles" size={15} />
          <span className="gb-text"><b>Get started</b> — {getStarted.done}/{getStarted.total} steps done</span>
          <button className="btn btn-sm btn-primary" onClick={getStarted.onOpen}>Resume setup</button>
          <button className="btn-ghost btn-sm" onClick={getStarted.onDismiss} aria-label="Hide setup checklist">Hide</button>
        </div>
      )}

      <div className="kpi-row">
        <div className="kpi"><span className="k accent">{dueNow}</span><span className="l">due today</span></div>
        <div className="kpi"><span className="k">{streak}</span><span className="l">day streak</span></div>
        <div className="kpi"><span className="k">{Math.round(desiredRetention * 100)}%</span><span className="l">target retention</span></div>
      </div>

      <div className="heatmap">
        <div className="hm-head">
          <div style={{ fontWeight: 600, fontSize: 13 }}>Study Streak (last 53 weeks)</div>
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

      <div className="chart-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="chart-card">
          <div style={{ fontWeight: 600, fontSize: 13 }}>Retention forecast</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>Average recall across reviewed cards. Dashed line is your target ({Math.round(desiredRetention * 100)}%)</div>
          <RetentionChart forecast={forecast} target={desiredRetention} />
        </div>
      </div>

      <ExamPlan remainingNew={cards.filter((c) => c.state === "new" && !c.tags.includes("suspended")).length} newPerDay={newPerDay} />

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
            <div className="empty-state" style={{ gridColumn: "1 / -1", flexDirection: "column" }}>
              <span className="es-ico"><Icon name="book" size={26} /></span>
              <span>No cards yet. Create one, import a file, or load demo content (Settings → Data).</span>
              {onOpenGuide && (
                <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={onOpenGuide}>
                  <Icon name="sparkles" size={12} /> Open setup guide
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeatmapGrid({ cells }: { cells: ReturnType<typeof heatGrid>["cells"] }) {
  const startDay = cells[0]?.date.getDay() ?? 0;
  const offset = startDay;
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
  const maxDay = Math.max(1, ...forecast.map((p) => p.day));
  const minR = points.length ? Math.min(...points.map((p) => p.r)) : 0.75;
  const floor = Math.floor(Math.min(0.75, minR) * 20) / 20;
  const span = Math.max(0.05, 1 - floor);
  const x = (d: number) => PAD.l + (d / maxDay) * (W - PAD.l - PAD.r);
  const y = (r: number) => {
    const c = Math.max(floor, Math.min(1, r));
    return H - PAD.b - ((c - floor) / span) * (H - PAD.t - PAD.b);
  };
  const ticks: number[] = [];
  for (let v = 1; v >= floor - 1e-9; v -= 0.05) ticks.push(Math.round(v * 100) / 100);
  const line = points.map((p) => `${x(p.day)},${y(p.r)}`).join(" ");
  const area = points.length ? `${x(points[0].day)},${H - PAD.b} ${line} ${x(points[points.length - 1].day)},${H - PAD.b}` : "";
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`}>
      {ticks.map((v) => (
        <g key={v}>
          <line className="grid-line" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} strokeWidth={0.7} />
          <text className="chart-label" x={4} y={y(v) + 3}>{Math.round(v * 100)}</text>
        </g>
      ))}
      <line className="chart-target" x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} strokeWidth={0.9} />
      {points.length > 0 && <polygon className="chart-area" points={area} />}
      {points.length > 0 && <polyline className="chart-line" points={line} />}
      {points.filter((_, i) => i % 5 === 0).map((p, i) => (
        <circle key={i} className="chart-dot" cx={x(p.day)} cy={y(p.r)} r={2} />
      ))}
      <text className="chart-label" x={x(0)} y={H - 5}>now</text>
      <text className="chart-label" x={x(maxDay) - 14} y={H - 5}>{maxDay}d</text>
    </svg>
  );
}

function ExamPlan({ remainingNew, newPerDay }: { remainingNew: number; newPerDay: number }) {
  const [date, setDate] = useState(() => localStorage.getItem("recall_exam_date") ?? "");
  const daysLeft = date ? Math.max(0, Math.ceil((new Date(`${date}T23:59:59`).getTime() - Date.now()) / 86_400_000)) : null;
  const needed = daysLeft && daysLeft > 0 ? Math.ceil(remainingNew / daysLeft) : remainingNew;
  const feasible = needed <= newPerDay;
  return (
    <div className="exam-plan-row">
      <Icon name="clock" size={13} />
      <span style={{ fontSize: 12, color: "var(--text-2)" }}>
        Exam plan — {remainingNew} new cards left. {daysLeft === null ? "Set a target date to see the daily pace." : daysLeft === 0 ? "Target date is today." : `${daysLeft} days left.`}
      </span>
      {date && (
        <span className="chip" style={{ color: feasible ? "var(--accent)" : "var(--danger)" }}>
          {feasible ? `${needed}/day fits your ${newPerDay} limit` : `${needed}/day needed, limit is ${newPerDay}`}
        </span>
      )}
      <input
        type="date"
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          localStorage.setItem("recall_exam_date", e.target.value);
        }}
        aria-label="Exam date"
        style={{ marginLeft: "auto", background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, padding: "4px 8px", fontSize: 12, color: "var(--text-1)" }}
      />
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
            <span>{group.total} cards</span>
          </div>
        </div>
      </div>
      <div className="dc-bottom">
        <div className="dc-stats">
          <span className="stat"><Icon name="clock" size={10} /> {group.due} due</span>
          {group.newCount > 0 && <span className="stat"><Icon name="sparkles" size={10} /> {group.newCount} new</span>}
        </div>
        <button className="btn btn-sm btn-primary dc-quick" onClick={(e) => { e.stopPropagation(); onStudy(); }}>
          <Icon name="bolt" size={11} /> Study
        </button>
      </div>
    </div>
  );
}