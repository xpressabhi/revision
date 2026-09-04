import { useEffect, useMemo, useRef, useState } from "react";
import type { CardWithState } from "../lib/types";
import type { TagNode } from "../lib/derive";
import type { StudyScope } from "../lib/derive";
import { fuzzySearch } from "../lib/search";
import { Icon, Keycap } from "./ui";

export type CmdAction = {
  id: string;
  ico: string;
  title: string;
  sub?: string;
  tags?: string[];
  group: string;
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  cards: CardWithState[];
  groups: TagNode[];
  actions: CmdAction[];
  onStudy: (scope: StudyScope) => void;
  onOpenCard: (id: number) => void;
};

type Row = { group: string; ico: string; title: string; sub?: string; tags?: string[]; run: () => void };

export function CommandBar({ open, onClose, cards, groups, actions, onStudy, onOpenCard }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results: Row[] = useMemo(() => {
    const rows: Row[] = [];
    const query = q.trim();

    const groupMatches = query ? fuzzySearch(query, groups, (g) => g.full).slice(0, 4) : groups.slice(0, 4).map((g) => ({ item: g, score: 0 }));
    for (const { item } of groupMatches) {
      rows.push({
        group: "Decks",
        ico: "book",
        title: item.full,
        sub: `${item.total} cards, ${item.due} due`,
        tags: ["↵ study", "⌘2 browse"],
        run: () => onStudy({ kind: "group", group: item.full }),
      });
    }

    if (query.length > 0) {
      const cardMatches = fuzzySearch(query, cards, (c) => `${c.front} ${c.back} ${c.tags}`).slice(0, 5);
      for (const { item } of cardMatches) {
        rows.push({
          group: "Cards",
          ico: "card",
          title: item.front.replace(/\{\{c\d+::/g, "").replace(/\}\}/g, "").slice(0, 60),
          sub: `${item.deck_name} (${item.state})`,
          tags: ["↵ edit"],
          run: () => onOpenCard(item.id),
        });
      }
    }

    const actionMatches = query ? fuzzySearch(query, actions, (a) => `${a.title} ${a.group}`).slice(0, 6) : actions.slice(0, 6).map((a) => ({ item: a, score: 0 }));
    for (const { item: a } of actionMatches) {
      rows.push({ group: a.group, ico: a.ico, title: a.title, sub: a.sub, tags: a.tags, run: a.run });
    }

    return rows;
  }, [q, cards, groups, actions, onStudy, onOpenCard]);

  useEffect(() => setSel(0), [q]);

  useEffect(() => {
    listRef.current?.querySelector(`.cmd-row[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const grouped = useMemo(() => {
    const out: { group: string; rows: Row[] }[] = [];
    for (const r of results) {
      const last = out[out.length - 1];
      if (last && last.group === r.group) last.rows.push(r);
      else out.push({ group: r.group, rows: [r] });
    }
    return out;
  }, [results]);

  if (!open) return null;

  const runRow = (idx: number) => {
    const row = results[idx];
    if (row) {
      row.run();
      onClose();
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runRow(sel);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (results[0]) {
        results[0].run();
        onClose();
      }
    } else if (e.metaKey && e.key === "1") {
      e.preventDefault();
      if (results[0]) {
        results[0].run();
        onClose();
      }
    }
  };

  return (
    <>
      <div className="cmd-backdrop" onClick={onClose} />
      <div className="cmd-bar" role="dialog" aria-label="Command bar">
        <div className="cmd-input">
          <span className="glyph"><Icon name="command" size={15} /></span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search decks, cards, tags, actions…" />
          <Keycap>Esc</Keycap>
        </div>
        <div className="cmd-list" ref={listRef}>
          {grouped.map((g) => (
            <div key={g.group}>
              <div className="cmd-group">{g.group}</div>
              {g.rows.map((r, i) => {
                const idx = results.indexOf(r);
                return (
                  <div
                    key={g.group + r.title + i}
                    className={`cmd-row ${idx === sel ? "sel" : ""}`}
                    data-idx={idx}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => runRow(idx)}
                  >
                    <span className="cr-ico"><Icon name={r.ico} size={13} /></span>
                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <span className="cr-title">{r.title}</span>
                      {r.sub && <span className="cr-sub">{r.sub}</span>}
                    </div>
                    <span className="cr-tags">{r.tags?.map((t) => <Keycap key={t}>{t}</Keycap>)}</span>
                  </div>
                );
              })}
            </div>
          ))}
          {results.length === 0 && (
            <div style={{ padding: "24px 14px", textAlign: "center", color: "var(--text-3)", fontSize: 12.5 }}>
              No matches for “{q}”. Press <Keycap>⌘N</Keycap> to create a card
            </div>
          )}
        </div>
        <div className="cmd-foot">
          <span><Keycap>↑</Keycap><Keycap>↓</Keycap> navigate</span>
          <span><Keycap>↵</Keycap> run</span>
          <span><Keycap>Tab</Keycap> fill</span>
          <span><Keycap>⌘1</Keycap> primary</span>
          <span style={{ marginLeft: "auto" }}>{results.length} results</span>
        </div>
      </div>
    </>
  );
}