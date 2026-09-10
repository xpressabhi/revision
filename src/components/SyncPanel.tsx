import { useRef, type ChangeEvent } from "react";
import type { SyncMode } from "../lib/syncFile";
import { Icon } from "./ui";

type Props = {
  mode: SyncMode;
  label: string | null;
  canAttach: boolean;
  lastSyncAt: string | null;
  busy: boolean;
  onAttach: () => void;
  onDetach: () => void;
  onSyncNow: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
};

function formatAt(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export function SyncPanel(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="set-card">
      <h3>Sync</h3>
      <p>
        {p.mode === "desktop"
          ? "Point the desktop and web apps at the same JSON file (Documents, iCloud Drive, Dropbox…). Sync now reads the file, merges it with this device and writes the result back."
          : "Attach one JSON file both apps can reach, or use export/import to move data manually."}
      </p>
      <div className="set-row">
        <span className="muted">Sync file</span>
        <span className="chip">{p.label ?? (p.mode === "download" ? "download mode" : "not attached")}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {p.canAttach && (
          <button className="btn" onClick={() => (p.label ? p.onDetach() : p.onAttach())} disabled={p.busy}>
            <Icon name="layers" size={13} /> {p.label ? "Detach / change file" : "Attach sync file…"}
          </button>
        )}
        <button className="btn btn-primary" onClick={() => p.onSyncNow()} disabled={p.busy || (p.mode === "desktop" && !p.label)}>
          <Icon name="refresh" size={13} /> {p.busy ? "Syncing…" : "Sync now"}
        </button>
        <button className="btn" onClick={() => p.onExport()} disabled={p.busy}>
          <Icon name="download" size={13} /> Export sync file
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={p.busy}>
          <Icon name="upload" size={13} /> Import / merge sync file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            if (f) p.onImportFile(f);
            e.target.value = "";
          }}
        />
      </div>
      <p style={{ fontSize: 11 }}>
        Last sync: {p.lastSyncAt ? formatAt(p.lastSyncAt) : "never"}. Cards match by a stable id, newest edit wins, review history is merged, deletions propagate.
      </p>
    </div>
  );
}
