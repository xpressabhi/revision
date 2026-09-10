import { useEffect, useState } from "react";
import { getDeckStats, initDb } from "./lib/db";
import type { DeckStats } from "./lib/types";
import { invoke } from "@tauri-apps/api/core";

const DECK_PALETTE = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ec4899", "#6366f1"];
function deckColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return DECK_PALETTE[Math.abs(h) % DECK_PALETTE.length];
}

export default function Widget() {
  const [stats, setStats] = useState<DeckStats[]>([]);
  const [due, setDue] = useState(0);
  const [fresh, setFresh] = useState(0);

  async function load() {
    await initDb();
    const s = await getDeckStats();
    setStats(s);
    setDue(s.reduce((a, x) => a + x.due, 0));
    setFresh(s.reduce((a, x) => a + x.newCount, 0));
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000); // refresh every minute
    // Listen for focus to refresh
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const total = stats.reduce((a, s) => a + s.total, 0);

  return (
    <div className="widget-root" data-tauri-drag-region>
      <div className="widget-header" data-tauri-drag-region>
        <span className="widget-title"><img className="widget-logo" src="/revision-logo.png" alt="" draggable={false} />Revision</span>
        <span className="widget-sub">Due {due} • New {fresh}</span>
        <button className="widget-close" onClick={() => invoke("hide_widget")} title="Hide widget">×</button>
      </div>

      <div className="widget-kpis">
        <div className="widget-kpi due">
          <span className="k">{due}</span>
          <span className="l">Due</span>
        </div>
        <div className="widget-kpi new">
          <span className="k">{fresh}</span>
          <span className="l">New</span>
        </div>
        <div className="widget-kpi total">
          <span className="k">{total}</span>
          <span className="l">Total</span>
        </div>
        <button className="widget-review" onClick={async () => {
          const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
          const main = await WebviewWindow.getByLabel("main");
          if (main) { await main.show(); await main.setFocus(); }
        }}>▶ Review</button>
      </div>

      <div className="widget-decks">
        {stats.map((s) => (
          <div key={s.deck_id} className="widget-deck">
            <span className="dot" style={{ background: deckColor(s.deck_name) }} />
            <span className="name" title={s.deck_name}>{shorten(s.deck_name)}</span>
            <span className="counts">{s.due} due</span>
          </div>
        ))}
      </div>

      <div className="widget-foot">
        <button className="link" onClick={async () => {
          const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
          const main = await WebviewWindow.getByLabel("main");
          if (main) { await main.show(); await main.setFocus(); }
        }}>Open Revision</button>
        <span className="muted">•</span>
        <button className="link" onClick={() => invoke("hide_widget")}>Hide</button>
      </div>
    </div>
  );
}

function shorten(name: string) {
  return name.replace("System Design", "SD").replace(" / ", "/");
}
