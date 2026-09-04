import { useMemo, useRef, useState } from "react";
import type { CardWithState } from "../lib/types";
import { cardRetrievability, dueInLabel, formatInterval } from "../lib/fsrs";
import { firstTag } from "../lib/derive";
import { Icon } from "./ui";

type Props = {
  cards: CardWithState[];
  lastReview: Map<number, string>;
  groupFilter: string | null;
  stateFilter: string;
  onGroupFilter: (g: string | null) => void;
  onStateFilter: (s: string) => void;
  onEdit: (card: CardWithState) => void;
  onDelete: (card: CardWithState) => void;
  onNew: () => void;
  counts: { total: number; due: number; newCount: number; learning: number };
  onImportCsv: (file: File) => Promise<void>;
  onExportCsv: () => Promise<void>;
};

export function BrowseView(p: Props) {
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    let r = p.cards;
    const gf = p.groupFilter;
    if (gf) r = r.filter((c) => c.tags.toLowerCase().includes(gf.toLowerCase()));
    if (p.stateFilter) r = r.filter((c) => c.state === p.stateFilter);
    const term = q.trim().toLowerCase();
    if (term) r = r.filter((c) => `${c.front} ${c.back} ${c.tags}`.toLowerCase().includes(term));
    return r;
  }, [p.cards, p.groupFilter, p.stateFilter, q]);

  const states = ["", "new", "learning", "review"];

  return (
    <div className="canvas-inner">
      <div className="page-head">
        <div className="page-title">
          <Icon name="layers" size={18} /> Browse
          <span className="sub">{p.counts.total} cards, {p.counts.due} due</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><Icon name="upload" size={12} /> Import CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => p.onExportCsv()}><Icon name="download" size={12} /> Export CSV</button>
          <button className="btn btn-primary" onClick={p.onNew}><Icon name="plus" size={12} /> New card</button>
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void p.onImportCsv(f);
          e.target.value = "";
        }} />
      </div>

      <div className="browse-toolbar">
        <div className="search-box">
          <Icon name="search" size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search front / back / tags…" />
        </div>
        <select className="btn btn-sm" style={{ height: 32 }} value={p.stateFilter} onChange={(e) => p.onStateFilter(e.target.value)}>
          {states.map((s) => (
            <option key={s} value={s}>{s === "" ? "All states" : s === "new" ? "New" : s === "learning" ? "Learning" : "Review"}</option>
          ))}
        </select>
        <button className={`btn btn-sm ${p.groupFilter === null ? "" : "btn-ghost"}`} onClick={() => p.onGroupFilter(p.groupFilter ? null : "spanish")}>
          group: {p.groupFilter ?? "all"}
        </button>
        <span className="chip mono" style={{ marginLeft: "auto" }}>{rows.length} shown</span>
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: "34%" }}>Front</th>
              <th>Deck</th>
              <th>State</th>
              <th>Due</th>
              <th>Interval</th>
              <th>R(t)</th>
              <th style={{ width: 84 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const r = cardRetrievability(c, p.lastReview.get(c.id));
              return (
                <tr key={c.id} onClick={() => p.onEdit(c)}>
                  <td className="td-front" title={c.front}>{c.front.replace(/\{\{c\d+::/g, "").replace(/\}\}/g, "").slice(0, 70)}</td>
                  <td className="td-sub">{firstTag(c)}</td>
                  <td><span className={`chip ${c.state}`}>{c.state === "new" ? "New" : c.state === "learning" ? "Learning" : "Review"}</span></td>
                  <td className="mono" style={{ color: new Date(c.due_at).getTime() <= Date.now() && c.state !== "new" ? "var(--danger)" : "var(--text-2)" }}>
                    {c.state === "new" ? "-" : dueInLabel(c.due_at)}
                  </td>
                  <td className="mono">{c.state === "new" ? "-" : c.interval >= 1 ? formatInterval(c.interval) : "10m"}</td>
                  <td className="mono" style={{ color: r ? (r >= 0.9 ? "var(--accent)" : r >= 0.8 ? "var(--warning)" : "var(--danger)") : "var(--text-4)" }}>
                    {r === null ? "-" : `${Math.round(r * 100)}%`}
                  </td>
                  <td>
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn-ghost btn-sm" title="Edit" onClick={() => p.onEdit(c)}><Icon name="card" size={12} /></button>
                      <button className="btn-ghost btn-sm" title="Delete" onClick={() => p.onDelete(c)}><Icon name="trash" size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state" style={{ border: "none", padding: "40px 20px" }}>
                    Nothing matches. Create a card with <Icon name="plus" size={11} /> New card.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}