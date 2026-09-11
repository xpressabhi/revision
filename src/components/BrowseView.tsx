import { useEffect, useMemo, useRef, useState } from "react";
import type { CardWithState } from "../lib/types";
import { dueInLabel } from "../lib/fsrs";
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
  onImport: () => void;
  onExportCsv: () => void;
  onBulkSuspend: (ids: number[]) => void;
  onBulkReset: (ids: number[]) => void;
  onBulkDelete: (ids: number[]) => void;
};

export function BrowseView(p: Props) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    let r = p.cards;
    const gf = p.groupFilter;
    if (gf) r = r.filter((c) => c.tags.toLowerCase().includes(gf.toLowerCase()));
    if (p.stateFilter) r = r.filter((c) => c.state === p.stateFilter);
    const term = q.trim().toLowerCase();
    if (term) r = r.filter((c) => `${c.front} ${c.back} ${c.tags}`.toLowerCase().includes(term));
    return r;
  }, [p.cards, p.groupFilter, p.stateFilter, q]);

  useEffect(() => {
    setSelected((s) => {
      const live = new Set(p.cards.map((c) => c.id));
      const next = new Set([...s].filter((id) => live.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [p.cards]);

  const allSelected = rows.length > 0 && rows.every((c) => selected.has(c.id));
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selected.size > 0 && !allSelected;
  }, [selected, allSelected]);

  const toggle = (id: number) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    setSelected((s) => {
      if (rows.every((c) => s.has(c.id))) {
        const n = new Set(s);
        for (const c of rows) n.delete(c.id);
        return n;
      }
      const n = new Set(s);
      for (const c of rows) n.add(c.id);
      return n;
    });
  };

  const ids = useMemo(() => [...selected], [selected]);
  const states = ["", "new", "learning", "review"];
  const groupOptions = useMemo(() => {
    const roots = Array.from(new Set(p.cards.map((c) => firstTag(c)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    if (p.groupFilter && !roots.includes(p.groupFilter)) roots.push(p.groupFilter);
    return roots;
  }, [p.cards, p.groupFilter]);

  return (
    <div className="canvas-inner">
      <div className="page-head">
        <div className="page-title">
          <Icon name="layers" size={18} /> Browse
          <span className="sub">{p.counts.total} cards, {p.counts.due} due</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="more-menu">
            <button
              className="btn btn-ghost btn-sm"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ···
            </button>
            {menuOpen && (
              <div className="more-pop" role="menu">
                <button role="menuitem" onClick={() => { setMenuOpen(false); p.onImport(); }}><Icon name="upload" size={12} /> Import cards</button>
                <button role="menuitem" onClick={() => { setMenuOpen(false); p.onExportCsv(); }}><Icon name="download" size={12} /> Export CSV</button>
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={p.onNew}><Icon name="plus" size={12} /> New card</button>
        </div>
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
        <select className="btn btn-sm" style={{ height: 32 }} value={p.groupFilter ?? ""} onChange={(e) => p.onGroupFilter(e.target.value || null)}>
          <option value="">All groups</option>
          {groupOptions.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <span className="chip mono" style={{ marginLeft: "auto" }}>{rows.length} shown</span>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span><b>{selected.size}</b> selected</span>
          <button className="btn btn-sm" onClick={() => p.onBulkSuspend(ids)}>Suspend</button>
          <button className="btn btn-sm" onClick={() => p.onBulkReset(ids)}>Reset scheduling</button>
          <button className="btn btn-sm btn-danger" onClick={() => { if (confirm(`Delete ${ids.length} cards? This cannot be undone.`)) p.onBulkDelete(ids); }}>Delete</button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 30 }}>
                <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all visible cards" />
              </th>
              <th style={{ width: "42%" }}>Front</th>
              <th className="col-tag">Tag</th>
              <th className="col-state">State</th>
              <th>Due</th>
              <th style={{ width: 84 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const isSel = selected.has(c.id);
              return (
                <tr key={c.id} onClick={() => p.onEdit(c)} className={isSel ? "selected" : ""}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSel} onChange={() => toggle(c.id)} aria-label={`Select ${c.front.slice(0, 40)}`} />
                  </td>
                  <td className="td-front" title={c.front}>{c.front.replace(/\{\{c\d+::/g, "").replace(/\}\}/g, "").slice(0, 70)}</td>
                  <td className="td-sub col-tag">{firstTag(c)}</td>
                  <td className="col-state"><span className={`chip ${c.state}`}>{c.state === "new" ? "New" : c.state === "learning" ? "Learning" : "Review"}</span></td>
                  <td className="mono" style={{ color: new Date(c.due_at).getTime() <= Date.now() && c.state !== "new" ? "var(--danger)" : "var(--text-2)" }}>
                    {c.state === "new" ? "-" : dueInLabel(c.due_at)}
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
                <td colSpan={6}>
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
