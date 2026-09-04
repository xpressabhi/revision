import { useState } from "react";
import { SHORTCUTS } from "../lib/hotkeys";
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
  autostart: boolean | null;
  onAutostart: (v: boolean) => void;
  isTauri: boolean;
  onToggleWidget: () => void;
  onLoadDemo: () => Promise<void>;
  onClearAll: () => Promise<void>;
  onDedupe: () => Promise<void>;
  onImportBookmarks: () => Promise<void>;
  onImportArticle: (url: string) => Promise<void>;
  chromeAvailable: boolean | null;
  airGestures: boolean;
  onAirGestures: (v: boolean) => void;
  staleMin: number;
  onStaleMin: (v: number) => void;
  autoEndOn: boolean;
  onAutoEnd: (v: boolean) => void;
  cardCount: number;
  reviewCount: number;
};

const THEMES: { id: ThemeId; name: string; sub: string; swatches: string[]; fg: string }[] = [
  { id: "dark-a", name: "Slate and Emerald", sub: "dark, Raycast/Linear", swatches: ["#0e0e12", "#1e1e26", "#3be28b"], fg: "#f5f5f7" },
  { id: "light-a", name: "Slate and Emerald", sub: "light", swatches: ["#f5f5f7", "#ffffff", "#0e9f6e"], fg: "#18181b" },
  { id: "dark-b", name: "OLED and Amber", sub: "dark, Superhuman/Arc", swatches: ["#0b0908", "#211b15", "#ffa233"], fg: "#f8f4ec" },
  { id: "light-b", name: "OLED and Amber", sub: "light", swatches: ["#fbf6ef", "#fffefc", "#d97706"], fg: "#241d14" },
];

export function SettingsView(p: Props) {
  const [articleUrl, setArticleUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="canvas-inner">
      <div className="page-head">
        <div className="page-title">
          <Icon name="settings" size={18} /> Settings
          <span className="sub">appearance, scheduler, content</span>
        </div>
      </div>

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
          <h3>FSRS Scheduler</h3>
          <p>Free Spaced Repetition Scheduler. R(t) uses FSRS-5 weights. Lower target retention means longer intervals and lighter load.</p>
          <div className="set-row">
            <span className="muted">Desired retention <span className="mono">{p.desiredRetention * 100}%</span></span>
            <input type="range" min={0.8} max={0.95} step={0.01} value={p.desiredRetention} onChange={(e) => p.onRetention(Number(e.target.value))} style={{ width: 160 }} />
          </div>
          <p style={{ fontSize: 11 }}>Grade keys: <b>1</b> Again (10m step), <b>2</b> Hard, <b>3</b> Good, <b>4</b> Easy. Predictions shown live on the grading bar.</p>
        </div>

        <div className="set-card">
          <h3>Content</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="btn" onClick={() => run("demo", p.onLoadDemo)} disabled={busy !== null}>
              <Icon name="sparkles" size={13} /> {busy === "demo" ? "Loading…" : "Load demo content"}
            </button>
            <p style={{ fontSize: 11 }}>Adds 37 cards across Spanish, Biology, DSA and System Design, plus about 90 days of review history for the heatmap. Deterministic, safe to re-run.</p>
            <button className="btn" onClick={() => run("bookmarks", p.onImportBookmarks)} disabled={busy !== null || p.chromeAvailable === false}>
              <Icon name="book" size={13} /> {busy === "bookmarks" ? "Importing…" : "Import Chrome bookmarks"}{p.chromeAvailable === false ? " (Chrome not detected)" : ""}
            </button>
          </div>
        </div>

        <div className="set-card">
          <h3>Import article (Zen)</h3>
          <p>Fetch a URL, extract the text and generate flashcards locally.</p>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={articleUrl}
              onChange={(e) => setArticleUrl(e.target.value)}
              placeholder="https://…"
              style={{ flex: 1, background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}
            />
            <button className="btn btn-primary" disabled={!articleUrl || busy !== null} onClick={() => run("article", async () => { await p.onImportArticle(articleUrl); setArticleUrl(""); })}>
              {busy === "article" ? "Fetching…" : "Fetch"}
            </button>
          </div>
        </div>

        <div className="set-card">
          <h3>Desktop integration</h3>
          <div className="set-row">
            <span className="muted">Launch at login</span>
            <button className={`btn btn-sm ${p.autostart ? "btn-primary" : ""}`} onClick={() => p.onAutostart(!p.autostart)} disabled={p.autostart === null || !p.isTauri}>
              {p.autostart ? "On" : "Off"}
            </button>
          </div>
          <div className="set-row">
            <span className="muted">Floating widget window (tray also toggles it)</span>
            <button className="btn btn-sm" onClick={p.onToggleWidget}>Toggle widget</button>
          </div>
          <p style={{ fontSize: 11 }}>Quick capture: <b>⌘⇧K</b> anywhere in the app. The macOS menu-bar widget shows Due/New/Total and can be added from Desktop → Edit Widgets.</p>
        </div>

        <div className="set-card">
          <h3>Gestures</h3>
          <div className="set-row">
            <span className="muted">Air gestures (camera)</span>
            <button className={`btn btn-sm ${p.airGestures ? "btn-primary" : ""}`} onClick={() => p.onAirGestures(!p.airGestures)}>
              {p.airGestures ? "On" : "Off"}
            </button>
          </div>
          <p style={{ fontSize: 11 }}>Hand tracking runs locally on your webcam. Nothing is uploaded. Raise your hand to flip with pinch and grade with air-swipes (left Again, right Good, up Easy, down Hard). macOS asks for camera access once. On desktop you can also drag the card directly or click to flip.</p>
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

        <div className="set-card">
          <h3>Danger zone</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="btn btn-danger btn-sm" onClick={() => run("dedupe", p.onDedupe)} disabled={busy !== null}>
              <Icon name="refresh" size={12} /> Deduplicate cards (front text), {p.cardCount} cards
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`Delete ALL ${p.cardCount} cards and ${p.reviewCount} reviews? This cannot be undone.`)) void run("clear", p.onClearAll); }} disabled={busy !== null}>
              <Icon name="trash" size={12} /> Clear all data
            </button>
          </div>
        </div>

        <div className="set-card" style={{ gridColumn: "1 / -1" }}>
          <h3>Keyboard map</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 4 }}>
            {(["global", "review", "editor", "capture"] as const).map((scope) => (
              <div key={scope}>
                <div className="hg-label" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)", fontWeight: 600, margin: "6px 0 4px" }}>
                  {scope}
                </div>
                {SHORTCUTS.filter((s) => s.scope === scope).map((s) => (
                  <div key={s.keys} className="help-row">
                    <span className="hr-key"><kbd className="keycap">{s.label}</kbd></span>
                    <span style={{ color: "var(--text-2)", fontSize: 11.5 }}>{s.desc}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}