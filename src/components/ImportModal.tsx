import { useRef, useState } from "react";
import { Icon } from "./ui";

type Tab = "file" | "paste" | "anki";

type Props = {
  open: boolean;
  isTauri: boolean;
  busy: string | null;
  onClose: () => void;
  onFile: (file: File) => void;
  onPaste: (text: string) => void;
  onAnki: () => void;
};

export function ImportModal({ open, isTauri, busy, onClose, onFile, onPaste, onAnki }: Props) {
  const [tab, setTab] = useState<Tab>("file");
  const [pasted, setPasted] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const pick = (f: File | undefined) => {
    if (f) onFile(f);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal import-modal" role="dialog" aria-modal="true" aria-label="Import cards">
        <div className="modal-head">
          <span className="mh-title">Import cards</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="btn-ghost btn-sm" onClick={onClose}>Close <span className="mono" style={{ fontSize: 9.5, opacity: 0.6 }}>esc</span></button>
          </div>
        </div>

        <div className="editor-tabs">
          <button className={`seg ${tab === "file" ? "active" : ""}`} onClick={() => setTab("file")}>CSV / Bookmarks</button>
          <button className={`seg ${tab === "paste" ? "active" : ""}`} onClick={() => setTab("paste")}>Paste text</button>
          <button className={`seg ${tab === "anki" ? "active" : ""}`} onClick={() => setTab("anki")} disabled={!isTauri}>Anki</button>
        </div>

        <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
          {tab === "file" && (
            <div className="editor-pane">
              <div
                className={`import-drop ${dragOver ? "over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  pick(e.dataTransfer.files?.[0]);
                }}
              >
                <Icon name="upload" size={22} />
                <div style={{ fontSize: 13, fontWeight: 600 }}>Drop a file here</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                  Revision CSV (<span className="mono">deck,front,back,tags</span>), Chrome bookmarks HTML, or bookmarks JSON
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                  {busy === "file" ? "Importing…" : "Choose file"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.html,.htm,.json,text/csv,text/html,application/json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    pick(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}

          {tab === "paste" && (
            <div className="editor-pane">
              <textarea
                className="editor-source"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={"One card per line:\nQuestion? :: Answer\nQuestion?\\tAnswer"}
              />
              <div className="editor-meta">
                <span className="muted" style={{ fontSize: 11 }}>
                  Separate front and back with <span className="mono">::</span> or a tab. Blank lines are ignored.
                </span>
                <button className="btn btn-primary btn-sm" disabled={!pasted.trim() || busy !== null} onClick={() => onPaste(pasted)}>
                  {busy === "paste" ? "Importing…" : "Import"}
                </button>
              </div>
            </div>
          )}

          {tab === "anki" && (
            <div className="editor-pane">
              <div className="import-drop">
                <Icon name="layers" size={22} />
                <div style={{ fontSize: 13, fontWeight: 600 }}>Import an Anki deck</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.6 }}>
                  Pick a <span className="mono">.apkg</span> export or a raw <span className="mono">collection.anki2</span> file.
                  Decks become tag trees. Review cards keep their interval; scheduling is approximated from Anki's interval.
                </div>
                <button className="btn btn-primary btn-sm" onClick={onAnki} disabled={busy !== null || !isTauri}>
                  {busy === "anki" ? "Importing…" : isTauri ? "Choose .apkg…" : "Desktop app only"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
