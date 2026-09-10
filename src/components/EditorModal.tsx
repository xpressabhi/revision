import { useEffect, useMemo, useRef, useState } from "react";
import type { CardWithState } from "../lib/types";
import { MarkdownView } from "../lib/markdown";
import { matchesChord } from "../lib/hotkeys";
import { Icon } from "./ui";

type Props = {
  card: CardWithState | null;
  onSave: (front: string, back: string, tags: string) => Promise<void>;
  onClose: () => void;
};

const MAX_IMAGE_BYTES = 1_500_000;

export function EditorModal({ card, onSave, onClose }: Props) {
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  const [tags, setTags] = useState<string[]>(() => (card?.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  const [tagInput, setTagInput] = useState("");
  const [tab, setTab] = useState<"front" | "back">("front");
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    frontRef.current?.focus();
  }, []);

  const clozeCount = useMemo(() => (front.match(/\{\{c\d+::/g) ?? []).length, [front]);
  const activeRef = tab === "front" ? frontRef : backRef;

  const addTag = (t: string) => {
    const clean = t.trim().replace(/^#/, "");
    if (!clean) return;
    if (!tags.some((x) => x.toLowerCase() === clean.toLowerCase())) setTags((s) => [...s, clean]);
    setTagInput("");
  };

  const removeTag = (t: string) => setTags((s) => s.filter((x) => x !== t));

  const insertAtCursor = (snippet: string, selectStart?: number, selectEnd?: number) => {
    const el = activeRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const next = value.slice(0, a) + snippet + value.slice(b);
    if (tab === "front") setFront(next);
    else setBack(next);
    el.focus();
    const s = selectStart ?? a + snippet.length;
    const e = selectEnd ?? a + snippet.length;
    window.setTimeout(() => el.setSelectionRange(s, e), 0);
  };

  const wrapSelection = (pre: string, post: string) => {
    const el = activeRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const snippet = pre + value.slice(a, b) + post;
    if (tab === "front") setFront(value.slice(0, a) + snippet + value.slice(b));
    else setBack(value.slice(0, a) + snippet + value.slice(b));
    el.focus();
    window.setTimeout(() => el.setSelectionRange(a + pre.length, b + pre.length), 0);
  };

  const wrapCloze = () => wrapSelection(`{{c${clozeCount + 1}::`, "}}");
  const insertMath = (display: boolean) => wrapSelection(display ? "$$\n" : "$", display ? "\n$$" : "$");

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItem = Array.from(items).find((i) => i.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Image is larger than 1.5 MB. Resize it first.");
      return;
    }
    setImageError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") insertAtCursor(`![image](${reader.result})`);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!front.trim()) return;
    setSaving(true);
    try {
      await onSave(front, back, tags.join(", "));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (matchesChord(e.nativeEvent, "mod+enter")) {
      e.preventDefault();
      e.stopPropagation();
      void save();
      return;
    }
    if (matchesChord(e.nativeEvent, "ctrl+shift+m")) {
      e.preventDefault();
      e.stopPropagation();
      insertMath(true);
      return;
    }
    if (matchesChord(e.nativeEvent, "ctrl+m")) {
      e.preventDefault();
      e.stopPropagation();
      insertMath(false);
      return;
    }
    if (matchesChord(e.nativeEvent, "ctrl+shift+c")) {
      e.preventDefault();
      e.stopPropagation();
      wrapCloze();
      return;
    }
    if (matchesChord(e.nativeEvent, "ctrl+f")) {
      e.preventDefault();
      e.stopPropagation();
      previewRef.current?.focus();
    }
  };

  return (
    <div className="modal-backdrop" onKeyDown={onKeyDown} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={card ? "Edit card" : "New card"}>
        <div className="modal-head">
          <span className="mh-title">{card ? "Edit card" : "New card"}</span>
          {clozeCount > 0 && <span className="chip cloze-chip" style={{ color: "var(--accent)" }}>cloze ×{clozeCount}</span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="btn-ghost btn-sm" onClick={onClose}>Cancel <span className="mono" style={{ fontSize: 9.5, opacity: 0.6 }}>esc</span></button>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={saving || !front.trim()} title="Save (⌘↵)">
              <Icon name="check" size={12} /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="editor-tabs">
          <button className={`seg ${tab === "front" ? "active" : ""}`} onClick={() => setTab("front")}>Front</button>
          <button className={`seg ${tab === "back" ? "active" : ""}`} onClick={() => setTab("back")}>Back</button>
          <span className="spacer" />
          <button className="seg" onClick={() => insertMath(false)} title="Inline math $…$ (⌃M)">Σ $x$</button>
          <button className="seg" onClick={() => insertMath(true)} title="Display math $$…$$ (⌃⇧M)">Σ $$x$$</button>
          <button className="seg" onClick={wrapCloze} title="Cloze wrap (⌃⇧C)">[[C]]</button>
        </div>

        <div className="modal-body">
          <div className="editor-pane">
            <textarea
              ref={tab === "front" ? frontRef : backRef}
              className="editor-source"
              value={tab === "front" ? front : back}
              onChange={(e) => (tab === "front" ? setFront(e.target.value) : setBack(e.target.value))}
              onPaste={(e) => void onPaste(e)}
              title="Paste an image to attach it"
              placeholder={tab === "front" ? "Question: markdown, $math$, {{c1::cloze}}, paste an image…" : "Answer: markdown, $math$, links…"}
            />
            {imageError && <div className="editor-warn">{imageError}</div>}
            <div className="editor-meta">
              <div className="tag-input-wrap">
                {tags.map((t) => (
                  <button key={t} className="chip tag" onClick={() => removeTag(t)}>
                    #{t} <span className="x">×</span>
                  </button>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagInput);
                    } else if (e.key === "Backspace" && !tagInput && tags.length) {
                      removeTag(tags[tags.length - 1]);
                    }
                  }}
                  placeholder="add tag… (a>b nests a deck)"
                />
              </div>
              <span className="muted" style={{ fontSize: 10.5, fontFamily: "var(--font-mono, ui-monospace)" }}>{tab === "front" ? front.length : back.length} chars</span>
            </div>
          </div>

          <div className="editor-pane">
            <div className="editor-preview" ref={previewRef} tabIndex={-1}>
              <div className="face-label" style={{ marginBottom: 8 }}>
                <span>Live preview</span>
                <span className="muted">{tab === "front" ? "cloze masked" : "answer"}</span>
              </div>
              <MarkdownView text={tab === "front" ? front : back} revealCloze={tab === "front" ? 0 : "all"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
