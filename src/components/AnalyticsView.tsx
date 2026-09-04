import { useMemo } from "react";
import type { CardWithState, ReviewRow } from "../lib/types";
import { buildTagTree, gradeShare, reviewsPerDay, streakLength, recentReviews, retentionForecast, queueBuckets } from "../lib/derive";
import { Icon } from "./ui";

type Props = {
  cards: CardWithState[];
  reviews: ReviewRow[];
  lastReview: Map<number, string>;
};

const GRADE_COLORS = ["var(--danger)", "var(--warning)", "var(--accent)", "var(--info)"];

export function AnalyticsView({ cards, reviews, lastReview }: Props) {
  const streak = useMemo(() => streakLength(reviews), [reviews]);
  const perDay = useMemo(() => reviewsPerDay(reviews, 14), [reviews]);
  const shares = useMemo(() => gradeShare(reviews), [reviews]);
  const groups = useMemo(() => buildTagTree(cards, lastReview), [cards, lastReview]);
  const forecast = useMemo(() => retentionForecast(cards, lastReview, 90), [cards, lastReview]);
  const buckets = useMemo(() => queueBuckets(cards), [cards]);
  const recent = useMemo(() => recentReviews(reviews, 8), [reviews]);
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const totalGrades = shares.reduce((a, b) => a + b.count, 0);
  const loadToday = cards.filter((c) => c.state !== "new" && new Date(c.due_at).getTime() <= Date.now()).length;
  const rAvg = useMemo(() => {
    const rs: number[] = [];
    for (const g of groups) if (g.rAvg !== null) rs.push(g.rAvg);
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  }, [groups]);
  const avgR90 = useMemo(() => {
    const pts = forecast.filter((f) => f.r !== null);
    const lastPts = pts.slice(-15);
    return lastPts.length ? lastPts.reduce((a, b) => a + (b.r ?? 0), 0) / lastPts.length : null;
  }, [forecast]);

  return (
    <div className="canvas-inner">
      <div className="page-head">
        <div className="page-title">
          <Icon name="chart" size={18} /> Study Analytics
          <span className="sub">FSRS load, retrieval, accuracy</span>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><span className="k accent">{streak}</span><span className="l">day streak</span></div>
        <div className="kpi"><span className="k">{reviews.length}</span><span className="l">total reviews</span></div>
        <div className="kpi"><span className="k" style={{ color: "var(--warning)" }}>{loadToday}</span><span className="l">due today</span></div>
        <div className="kpi"><span className="k">{rAvg !== null ? `${Math.round(rAvg * 100)}%` : "-"}</span><span className="l">avg R(t) now</span></div>
        <div className="kpi"><span className="k" style={{ color: "var(--accent)" }}>{avgR90 !== null ? `${Math.round(avgR90 * 100)}%` : "-"}</span><span className="l">projected R (90d)</span></div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div style={{ fontWeight: 600, fontSize: 13 }}>Reviews per day (last 14 days)</div>
          <DailyBars data={perDay} />
        </div>
        <div className="chart-card">
          <div style={{ fontWeight: 600, fontSize: 13 }}>Grade distribution (FSRS)</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>Again lapses vs successful recalls</div>
          <div className="queue-bars" style={{ marginTop: 6 }}>
            {shares.map((s) => (
              <div className="queue-bar" key={s.grade}>
                <span className="lbl">{["Again", "Hard", "Good", "Easy"][s.grade - 1]}</span>
                <div className="track"><div className="fill" style={{ width: `${totalGrades ? (s.count / totalGrades) * 100 : 0}%`, background: GRADE_COLORS[s.grade - 1] }} /></div>
                <span className="val">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div style={{ fontWeight: 600, fontSize: 13 }}>Memory load (90-day forecast)</div>
          <div className="queue-bars" style={{ marginTop: 4 }}>
            {buckets.map((b) => (
              <div className="queue-bar" key={b.label}>
                <span className="lbl">{b.label}</span>
                <div className="track"><div className={`fill ${b.days <= 1 ? "danger" : b.days <= 3 ? "warn" : ""}`} style={{ width: `${(b.count / Math.max(1, ...buckets.map((x) => x.count))) * 100}%` }} /></div>
                <span className="val">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <div style={{ fontWeight: 600, fontSize: 13 }}>Retention by deck</div>
          <div className="queue-bars" style={{ marginTop: 4 }}>
            {groups.filter((g) => !g.child && g.rAvg !== null).map((g) => (
              <div className="queue-bar" key={g.full}>
                <span className="lbl">{g.root}</span>
                <div className="track"><div className="fill" style={{ width: `${(g.rAvg ?? 0) * 100}%`, background: (g.rAvg ?? 0) >= 0.9 ? "var(--accent)" : (g.rAvg ?? 0) >= 0.8 ? "var(--warning)" : "var(--danger)" }} /></div>
                <span className="val">{Math.round((g.rAvg ?? 0) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-card">
        <div style={{ fontWeight: 600, fontSize: 13 }}>Recent activity</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {recent.map((r) => {
            const c = cardById.get(r.card_id);
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--hairline)", fontSize: 12 }}>
                <span className="chip" style={{ background: GRADE_COLORS[r.grade - 1], color: r.grade >= 3 ? "var(--bg)" : "var(--bg)", border: "none", fontSize: 10, fontWeight: 700 }}>
                  {["Again", "Hard", "Good", "Easy"][r.grade - 1]}
                </span>
                <span className="ellipsis" style={{ flex: 1, color: "var(--text-2)" }}>
                  {c ? c.front.replace(/\{\{c\d+::/g, "").replace(/\}\}/g, "").slice(0, 60) : "deleted card"}
                </span>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                  {new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
          {recent.length === 0 && <div className="empty-state" style={{ border: "none", padding: 32 }}>No reviews yet. Start studying.</div>}
        </div>
      </div>
    </div>
  );
}

function DailyBars({ data }: { data: { label: string; count: number; date: Date }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const isToday = (d: Date) => d.toDateString() === new Date().toDateString();
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110, marginTop: 8 }}>
      {data.map((d) => (
        <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--text-4)" }}>{d.count || ""}</span>
          <div
            title={`${d.label}: ${d.count}`}
            style={{
              width: "100%",
              height: `${Math.max(3, (d.count / max) * 80)}px`,
              borderRadius: "4px 4px 0 0",
              background: isToday(d.date) ? "var(--accent)" : d.count ? "var(--accent)" : "var(--gauge-track)",
              opacity: isToday(d.date) ? 1 : d.count ? 0.45 : 1,
              transition: "height 400ms var(--ease-out)",
            }}
          />
          <span className="mono" style={{ fontSize: 8.5, color: "var(--text-4)", whiteSpace: "nowrap" }}>{isToday(d.date) ? "now" : d.label}</span>
        </div>
      ))}
    </div>
  );
}