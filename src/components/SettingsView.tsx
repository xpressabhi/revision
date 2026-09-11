import { useRef, useState, type ReactNode } from "react";
import { STALE_OPTIONS } from "../lib/session";
import { Icon } from "./ui";

export type ThemeId = "dark-a" | "light-a" | "dark-b" | "light-b";

type Props = {
  theme: ThemeId;
  onTheme: (t: ThemeId) => void;
  density: "relaxed" | "standard" | "compact";
  onDensity: (d: "relaxed" | "standard" | "compact") => void;
  desiredRetention: number;
  onRetention: (r: number) => void;
  newPerDay: number;
  onNewPerDay: (n: number) => void;
  reviewsPerDay: number;
  onReviewsPerDay: (n: number) => void;
  autostart: boolean | null;
  onAutostart: (v: boolean) => void;
  isTauri: boolean;
  autoBackupAt: string | null;
  onExportBackup: () => void;
  onImportBackupFile: (file: File) => void;
  onRestoreAutoBackup: () => void;
  onImportAnki: () => void;
  onLoadDemo: () => void;
  onClearAll: () => void;
  onDedupe: () => void;
  onExportCsv: () => void;
  staleMin: number;
  onStaleMin: (v: number) => void;
  autoEndOn: boolean;
  onAutoEnd: (v: boolean) => void;
  cardCount: number;
  reviewCount: number;
  syncPanel: ReactNode;
};

type Tab = "study" | "data" | "app";

const THEMES: { id: ThemeId; name: string; sub: string; swatches: string[]; fg: string }[] = [
  { id: "dark-a", name: "Slate and Emerald", sub: "dark, Raycast/Linear", swatches: ["#0e0e12", "#1e1e26", "#3be28b"], fg: "#f5f5f7" },
  { id: "light-a", name: "Slate and Emerald", sub: "light", swatches: ["#f5f5f7", "#ffffff", "#0e9f6e"], fg: "#18181b" },
  { id: "dark-b", name: "OLED and Amber", sub: "dark, Superhuman/Arc", swatches: ["#0b0908", "#211b15", "#ffa233"], fg: "#f8f4ec" },
  { id: "light-b", name: "OLED and Amber", sub: "light", swatches: ["#fbf6ef", "#fffefc", "#d97706"], fg: "#241d14" },
];

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: "study", label: "Study", sub: "scheduler and activity" },
  { id: "data", label: "Data", sub: "backup, sync and imports" },
  { id: "app", label: "App", sub: "appearance, desktop, advanced" },
];

export function SettingsView(p: Props) {
  const [tab, setTab] = useState<Tab>("study");
  const [busy, setBusy] = useState<string | null>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const numStyle: React.CSSProperties = { width: 70, background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, padding: "6px 8px", fontSize: 12, textAlign: "right" };

  return (
    <div className="canvas-inner">
      <div className="page-head">
        <div className="page-title">
          <Icon name="settings" size={18} /> Settings
          <span className="sub">appearance, scheduler, data, activity</span>
        </div>
      </div>

      <div className="settings-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`seg ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "study" && (
        <div className="settings-grid">
          <div className="set-card">
            <h3>Scheduler</h3>
            <p>Lower target retention means longer intervals and a lighter daily load.</p>
            <div className="set-row">
              <span className="muted">Target retention <span className="mono">{Math.round(p.desiredRetention * 100)}%</span></span>
              <input type="range" min={0.8} max={0.95} step={0.01} value={p.desiredRetention} onChange={(e) => p.onRetention(Number(e.target.value))} style={{ width: 160 }} />
            </div>
            <div className="set-row">
              <span className="muted">New cards per day</span>
              <input type="number" min={0} max={999} value={p.newPerDay} onChange={(e) => p.onNewPerDay(Math.max(0, Math.min(999, Number(e.target.value) || 0)))} style={numStyle} />
            </div>
            <div className="set-row">
              <span className="muted">Reviews per day</span>
              <input type="number" min={0} max={9999} value={p.reviewsPerDay} onChange={(e) => p.onReviewsPerDay(Math.max(0, Math.min(9999, Number(e.target.value) || 0)))} style={numStyle} />
            </div>
            <p style={{ fontSize: 11 }}>Limits apply to Study scopes. Smart filters always show everything. Grades: <b>1</b> Again, <b>2</b> Hard, <b>3</b> Good, <b>4</b> Easy.</p>
          </div>

          <div className="set-card">
            <h3>Activity</h3>
            <div className="set-row">
              <span className="muted">Step-away detection. If you stay idle that long mid-review, the answer hides and the session pauses</span>
              <div style={{ display: "flex", gap: 4 }}>
                {STALE_OPTIONS.map((o) => (
                  <button key={o.value} className={`btn btn-sm ${p.staleMin === o.value ? "btn-primary" : ""}`} onClick={() => p.onStaleMin(o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="set-row">
              <span className="muted">End sessions idle for 15 min (queue re-derives on next start)</span>
              <button className={`btn btn-sm ${p.autoEndOn ? "btn-primary" : ""}`} onClick={() => p.onAutoEnd(!p.autoEndOn)}>
                {p.autoEndOn ? "On" : "Off"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "data" && (
        <div className="settings-grid">
          <div className="set-card">
            <h3>Backup</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn" onClick={() => run("backup", async () => p.onExportBackup())} disabled={busy !== null}>
                <Icon name="download" size={13} /> {busy === "backup" ? "Exporting…" : "Export backup (JSON, full state)"}
              </button>
              <button className="btn" onClick={() => backupRef.current?.click()} disabled={busy !== null}>
                <Icon name="upload" size={13} /> Import backup
              </button>
              <input
                ref={backupRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void run("restore", async () => p.onImportBackupFile(f));
                  e.target.value = "";
                }}
              />
              <button className="btn" onClick={() => run("auto", async () => p.onRestoreAutoBackup())} disabled={busy !== null || !p.autoBackupAt}>
                <Icon name="refresh" size={13} /> Restore auto-backup{p.autoBackupAt ? ` (${p.autoBackupAt.slice(0, 16).replace("T", " ")})` : ""}
              </button>
              <p style={{ fontSize: 11 }}>A snapshot is saved automatically before clear, dedupe and restore. Backups include scheduling state; CSV does not.</p>
            </div>
          </div>

          {p.syncPanel}

          <div className="set-card">
            <h3>Import &amp; export</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn" onClick={() => run("anki", async () => p.onImportAnki())} disabled={busy !== null || !p.isTauri}>
                <Icon name="layers" size={13} /> {busy === "anki" ? "Importing…" : "Import Anki deck (.apkg)"}{p.isTauri ? "" : " (desktop only)"}
              </button>
              <button className="btn" onClick={() => run("csv", async () => p.onExportCsv())} disabled={busy !== null}>
                <Icon name="download" size={13} /> Export CSV
              </button>
              <button className="btn" onClick={() => run("demo", async () => p.onLoadDemo())} disabled={busy !== null}>
                <Icon name="sparkles" size={13} /> {busy === "demo" ? "Loading…" : "Load demo content"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "app" && (
        <div className="settings-grid">
          <div className="set-card">
            <h3>Appearance</h3>
            <div className="theme-swatches">
              {THEMES.map((t) => (
                <button key={t.id} className={`theme-swatch ${p.theme === t.id ? "active" : ""}`} onClick={() => p.onTheme(t.id)} style={{ background: t.swatches[0], color: t.fg }}>
                  <span className="sw-swatches">
                    {t.swatches.map((s, i) => <i key={i} style={{ background: s, flex: 1 }} />)}
                  </span>
                  <span className="sw-name">{t.name}</span>
                  <span className="sw-sub">{t.sub}</span>
                </button>
              ))}
            </div>
            <div className="set-row">
              <span className="muted">Density</span>
              <div style={{ display: "flex", gap: 4 }}>
                {(["relaxed", "standard", "compact"] as const).map((d) => (
                  <button key={d} className={`btn btn-sm ${p.density === d ? "btn-primary" : ""}`} onClick={() => p.onDensity(d)}>
                    {d[0].toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="set-card">
            <h3>Desktop</h3>
            <div className="set-row">
              <span className="muted">Launch at login</span>
              <button className={`btn btn-sm ${p.autostart ? "btn-primary" : ""}`} onClick={() => p.onAutostart(!p.autostart)} disabled={p.autostart === null || !p.isTauri}>
                {p.autostart ? "On" : "Off"}
              </button>
            </div>
            <div className="set-row">
              <span className="muted">Global quick capture <span className="mono">⌥⇧K</span></span>
              <span className="chip">{p.isTauri ? "registered" : "desktop app only"}</span>
            </div>
            <p style={{ fontSize: 11 }}>The tray shows Due/New and can start a review. In-app: <b>⌘⇧K</b>.</p>
          </div>

          <details className="set-card advanced-card">
            <summary>Advanced</summary>
            <p style={{ fontSize: 11 }}>These affect all {p.cardCount} cards and {p.reviewCount} reviews. An auto-backup is taken first.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn btn-danger btn-sm" onClick={() => run("dedupe", async () => p.onDedupe())} disabled={busy !== null}>
                <Icon name="refresh" size={12} /> Deduplicate cards (same front)
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`Delete ALL ${p.cardCount} cards and ${p.reviewCount} reviews? An auto-backup is taken first.`)) void run("clear", async () => p.onClearAll()); }} disabled={busy !== null}>
                <Icon name="trash" size={12} /> Clear all data
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
