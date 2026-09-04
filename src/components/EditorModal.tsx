import { useEffect, useMemo, useRef, useState } from "react";
import type { CardWithState } from "../lib/types";
import { MarkdownView } from "../lib/markdown";
import { generateVariants, type GeneratedVariant } from "../lib/ai";
import { Icon } from "./ui";

type Props = {
  card: CardWithState | null;
  deckId: number;
  presetFront?: string;
  presetBack?: string;
  presetTags?: string;
  onSave: (front: string, back: string, tags: string) => Promise<void>;
  onClose: () => void;
};

export function EditorModal({ card, deckId, presetFront, presetBack, presetTags, onSave, onClose }: Props) {
  const [front, setFront] = useState(presetFront ?? card?.front ?? "");
  const [back, setBack] = useState(presetBack ?? card?.back ?? "");
  const [tags, setTags] = useState<string[]>(() => (presetTags ?? card?.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  const [tagInput, setTagInput] = useState("");
  const [tab, setTab] = useState<"front" | "back">("front");
  const [template, setTemplate] = useState<"qa" | "cloze" | "multi">("qa");
  const [aiOpen, setAiOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState("");
  const [genMode, setGenMode] = useState<"qa" | "cloze" | "cards">("qa");
  const [difficulty, setDifficulty] = useState(3);
  const [variants, setVariants] = useState<GeneratedVariant[]>([]);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    frontRef.current?.focus();
  }, []);

  const clozeCount = useMemo(() => (front.match(/\{\{c\d+::/g) ?? []).length, [front]);
  const selectedTags = tags;

  const addTag = (t: string) => {
    const clean = t.trim().replace(/^#/, "");
    if (!clean) return;
    if (!selectedTags.some((x) => x.toLowerCase() === clean.toLowerCase())) setTags((s) => [...s, clean]);
    setTagInput("");
  };

  const removeTag = (t: string) => setTags((s) => s.filter((x) => x !== t));

  const wrapSelection = (pre: string, post: string) => {
    const el = frontRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    setFront(value.slice(0, a) + pre + value.slice(a, b) + post + value.slice(b));
    el.focus();
    window.setTimeout(() => {
      el.setSelectionRange(a + pre.length, b + pre.length);
    }, 0);
  };

  const wrapCloze = () => {
    wrapSelection(`{{c${clozeCount + 1}::`, "}}");
  };

  const insertMath = (display: boolean) => {
    wrapSelection(display ? "$$\n" : "$", display ? "\n$$" : "$");
  };

  const generate = () => {
    setVariants(generateVariants(source || back || front, genMode, difficulty, tags[0] ?? "generated"));
  };

  const acceptVariant = (v: GeneratedVariant) => {
    setFront(v.front);
    setBack(v.back);
    if (v.tags && !tags.includes(v.tags)) setTags((s) => [...s, v.tags]);
    setAiOpen(false);
    setTab("back");
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
    if (e.key === "Escape" && !aiOpen) {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onKeyDown={onKeyDown} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <span className="mh-title">{card ? "Edit card" : "New card"}</span>
          <span className="chip mono" style={{ fontSize: 10 }}>#{deckId}</span>
          {clozeCount > 0 && <span className="chip cloze-chip" style={{ color: "var(--accent)" }}>cloze ×{clozeCount}</span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="btn-ghost btn-sm" onClick={() => setAiOpen(true)} title="AI generator (⌃⇧D)">
              <Icon name="sparkles" size={12} /> Generate
            </button>
            <button className="btn-ghost btn-sm" onClick={onClose}>Cancel <span className="mono" style={{ fontSize: 9.5, opacity: 0.6 }}>esc</span></button>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={saving || !front.trim()} title="Save (⌘↵)">
              <Icon name="check" size={12} /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="editor-tabs">
          <button className={`seg ${template === "qa" ? "active" : ""}`} onClick={() => setTemplate("qa")}>Q&A</button>
          <button className={`seg ${template === "cloze" ? "active" : ""}`} onClick={() => { setTemplate("cloze"); }}>Cloze</button>
          <button className={`seg ${template === "multi" ? "active" : ""}`} onClick={() => setTemplate("multi")}>Multi-Basic</button>
          <span style={{ fontSize: 10.5, color: "var(--text-4)", marginLeft: 6 }}>
            {template === "cloze" ? "Wrap a selection with ⌃⇧C → {{c1::…}}" : template === "qa" ? "Question → Answer markdown" : "Two prompts, one answer set"}
          </span>
          <span className="spacer" />
          <button className="seg" onClick={() => insertMath(false)} title="Inline math $…$ (⌃M)">Σ $x$</button>
          <button className="seg" onClick={() => insertMath(true)} title="Display math $$…$$ (⌃⇧M)">Σ $$x$$</button>
          <button className="seg" onClick={wrapCloze} title="Cloze wrap (⌃⇧C)">[[C]]</button>
          <button className={`seg ${tab === "front" ? "active" : ""}`} onClick={() => setTab("front")}>Front</button>
          <button className={`seg ${tab === "back" ? "active" : ""}`} onClick={() => setTab("back")}>Back</button>
        </div>

        <div className="modal-body">
          <div className="editor-pane">
            <textarea
              ref={frontRef}
              className="editor-source"
              value={tab === "front" ? front : back}
              onChange={(e) => (tab === "front" ? setFront(e.target.value) : setBack(e.target.value))}
              placeholder={tab === "front" ? "Question: markdown, $math$, {{c1::cloze}}…" : "Answer: markdown, $math$, links…"}
            />
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
            <div className="editor-preview">
              <div className="face-label" style={{ marginBottom: 8 }}>
                <span>Live preview</span>
                <span className="muted">{tab === "front" ? "cloze masked" : "answer"}</span>
              </div>
              <MarkdownView text={tab === "front" ? front : back} revealCloze={tab === "front" ? 0 : "all"} />
            </div>
          </div>
        </div>
      </div>

      {aiOpen && (
        <div className="drawer" style={{ position: "fixed", top: 0, right: 0, bottom: 0 }}>
          <div className="drawer-head">
            <Icon name="sparkles" size={14} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>AI Card Generator</span>
            <span style={{ fontSize: 10, color: "var(--text-4)" }}>(on-device heuristics)</span>
            <button className="btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => setAiOpen(false)}><Icon name="x" size={13} /></button>
          </div>
          <div className="drawer-body">
            <textarea value={source} onChange={(e) => setSource(e.target.value)} placeholder="Paste raw text: a paragraph, a definition, a chapter snippet. Generates cloze deletions or Q and A pairs from it." />
            <div className="prompt-chips">
              {(["qa", "cloze", "cards"] as const).map((m) => (
                <button key={m} className={`chip ${genMode === m ? "active" : ""}`} onClick={() => setGenMode(m)}>
                  {m === "qa" ? "Q&A pairs" : m === "cloze" ? "Cloze passages" : "Flashcards"}
                </button>
              ))}
            </div>
            <div className="slider-row">
              <span>Difficulty</span>
              <input type="range" min={1} max={5} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} />
              <span className="mono">{difficulty}/5</span>
            </div>
            <button className="btn btn-primary" onClick={generate}><Icon name="sparkles" size={13} /> Generate variants</button>
            {variants.map((v, i) => (
              <div key={i} className="gen-variant">
                <span className="gv-note">{v.note}</span>
                <MarkdownView text={v.front} />
                <div style={{ borderTop: "1px solid var(--hairline)" }} />
                <MarkdownView text={v.back} />
                <div className="gv-actions">
                  <button className="btn btn-sm" onClick={() => acceptVariant(v)}><Icon name="check" size={11} /> Use this</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}