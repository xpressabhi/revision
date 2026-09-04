import { useEffect, useRef, useState } from "react";
import { Icon, Keycap } from "./ui";

type Props = {
  open: boolean;
  groups: string[];
  onClose: () => void;
  onSave: (front: string, back: string, tags: string) => Promise<void>;
};

export function QuickCapture({ open, groups, onClose, onSave }: Props) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [group, setGroup] = useState(groups[0] ?? "");
  const [saving, setSaving] = useState(false);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setFront("");
      setBack("");
      setGroup(groups[0] ?? "");
      window.setTimeout(() => frontRef.current?.focus(), 30);
    }
  }, [open, groups]);

  // Seed the back field with any selected text on open (simplified clipboard read)
  useEffect(() => {
    if (open && !back) {
      try {
        navigator.clipboard?.readText().then((t) => {
          if (t && t.length > 3 && t.length < 4000 && !front) setBack(t.slice(0, 3000));
        }).catch(() => {});
      } catch {
        /* clipboard unavailable */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const save = async () => {
    if (!front.trim()) return;
    setSaving(true);
    try {
      await onSave(front, back, group);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="cmd-backdrop" onClick={onClose} />
      <div className="capture" role="dialog" aria-label="Quick capture">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--accent)" }}><Icon name="capture" size={15} /></span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Quick capture</span>
          <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>⌘⇧K (flashcard from anywhere)</span>
          <button className="btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={onClose}><Icon name="x" size={13} /></button>
        </div>
        <textarea
          ref={frontRef}
          className="cap-field"
          value={front}
          onChange={(e) => setFront(e.target.value)}
          placeholder="Front: question or cloze prompt…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) {
              e.preventDefault();
              void save();
            }
          }}
        />
        <textarea
          className="cap-field"
          value={back}
          onChange={(e) => setBack(e.target.value)}
          placeholder="Back: answer or explanation (prefilled from clipboard)…"
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select className="btn btn-sm" value={group} onChange={(e) => setGroup(e.target.value)} style={{ height: 30 }}>
            {groups.length ? groups.map((g) => <option key={g} value={g}>{g}</option>) : <option value="">no decks</option>}
          </select>
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => void save()} disabled={saving || !front.trim()}>
            <Icon name="check" size={12} /> Save <Keycap>⌘↵</Keycap>
          </button>
        </div>
      </div>
    </>
  );
}