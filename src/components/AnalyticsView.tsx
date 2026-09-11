import { useMemo } from "react";
import type { CardWithState, ReviewRow } from "../lib/types";
import { gradeShare, reviewsPerDay, streakLength, recentReviews, queueBuckets, type TagNode } from "../lib/derive";
import { Icon } from "./ui";

type Props = {
  cards: CardWithState[];
  reviews: ReviewRow[];
  groups: TagNode[];
  lastReview: Map<number, string>;
};

const GRADE_COLORS = ["var(--danger)", "var(--warning)", "var(--accent)", "var(--info)"];

export function AnalyticsView({ cards, reviews, groups }: Props) {
  const streak = useMemo(() => streakLength(reviews), [reviews]);
  const perDay = useMemo(() => reviewsPerDay(reviews, 14), [reviews]);
  const shares = useMemo(() => gradeShare(reviews), [reviews]);
  const buckets = useMemo(() => queueBuckets(cards), [cards]);
  const recent = useMemo(() => recentReviews(reviews, 5), [reviews]);
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const totalGrades = shares.reduce((a, b) => a + b.count, 0);
  const since30 = useMemo(() => Date.now() - 30 * 86_400_000, []);
  const reviews30 = useMemo(() => reviews.filter((r) => new Date(r.created_at).getTime() >= since30).length, [reviews, since30]);
  const passRate30 = useMemo(() => {
    const recent30 = reviews.filter((r) => new Date(r.created_at).getTime() >= since30);
    if (recent30.length === 0) return null;
    return recent30.filter((r) => r.grade >= 2).length / recent30.length;
  }, [reviews, since30]);

  return (
    <div className="canvas-inner">
      <div className="page-head">
        <div className="page-title">
          <Icon name="chart" size={18} /> Progress
          <span className="sub">streak, accuracy, load</span>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><span className="k accent">{streak}</span><span className="l">day streak</span></div>
        <div className="kpi"><span className="k">{reviews30}</span><span className="l">reviews (30d)</span></div>
        <div className="kpi"><span className="k" style={{ color: "var(--accent)" }}>{passRate30 !== null ? `${Math.round(passRate30 * 100)}%` : "-"}</span><span className="l">pass rate (30d)</span></div>
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
          <div style={{ fontWeight: 600, fontSize: 13 }}>Coming up (90 days)</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>When learned cards will come due</div>
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