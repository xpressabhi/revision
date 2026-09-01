// Shared UI primitives: inline icon set, keycaps, progress ring, segmented control.

const PATHS: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  command: <><path d="M9 6a3 3 0 1 0-3 3h9a3 3 0 1 0-3-3v9a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  x: <><path d="m6 6 12 12M18 6 6 18" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
  layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M8 17v-6M13 17V7M18 17v-9" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  bolt: <><path d="M13 2 3 14h7l-1 8 11-13h-7l1-7Z" /></>,
  star: <><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2Z" /></>,
  flame: <><path d="M12 22c4.4 0 8-3.6 8-8 0-5-4-8-8-12-4 4-8 7-8 12 0 4.4 3.6 8 8 8Z" /><path d="M12 22c2.2 0 4-1.8 4-4 0-2.5-2-4-4-6-2 2-4 3.5-4 6 0 2.2 1.8 4 4 4Z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <><path d="m4 12.5 5.5 5.5L20 6.5" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  play: <><path d="m7 4 12 8-12 8V4Z" /></>,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  filter: <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></>,
  tag: <><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.6" /></>,
  brain: <><path d="M9.5 3A2.5 2.5 0 0 0 7 5.5v.55A3.5 3.5 0 0 0 5 13.4V15a3 3 0 0 0 3 3h.5V20a2 2 0 0 0 4 0v-1.5m-4-10A2.5 2.5 0 0 1 12 6v6m-3.5-4h3.5M12 6a2.5 2.5 0 0 1 2.5-2.5c1 0 1.9.6 2.3 1.5a3.5 3.5 0 0 1 1.7 7.4V15a3 3 0 0 1-3 3h-.5V20a2 2 0 0 1-4 0v-1.5" /></>,
  sparkles: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></>,
  capture: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m7 5 1.5-2h7L17 5" /><circle cx="12" cy="12" r="3" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></>,
  wink: <><circle cx="12" cy="12" r="9" /><path d="M9 9.5h.01M15 9.5h.01" /><path d="M8.5 14.5c.9 1.1 2.2 1.7 3.5 1.7s2.6-.6 3.5-1.7" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-3-6.3" /><path d="M20 3v4h-4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
  upload: <><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 21h16" /></>,
  graph: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  warn: <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17.5h.01" /></>,
  keyboard: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" /></>,
  focus: <><path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" /></>,
  moon: <><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5a8.5 8.5 0 1 0 10.5 10.5Z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
};

export function Icon({ name, size = 15, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  const path = PATHS[name] ?? PATHS.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {path}
    </svg>
  );
}

export function Keycap({ children }: { children: React.ReactNode }) {
  return <kbd className="keycap">{children}</kbd>;
}

export function ProgressRing({ pct, size = 46, stroke = 3, color, track, children }: { pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  const offset = c * (1 - clamped);
  return (
    <div className="dc-ring" style={{ width: size, height: size }}>
      <svg className="ring-svg" width={size} height={size}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={(track as string) ?? undefined} />
        <circle
          className="ring-fg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      {children && <div className="ring-center">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, background: "var(--raised)", border: "1px solid var(--hairline)", borderRadius: 9, padding: 2 }}>
      {options.map((o) => (
        <button key={o.id} className={`seg ${value === o.id ? "active" : ""}`} onClick={() => onChange(o.id)} style={{ height: 24, padding: "0 10px", borderRadius: 6, fontSize: 11, color: value === o.id ? "var(--accent)" : "var(--text-3)", fontWeight: value === o.id ? 600 : 400 }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function fmtPct(r: number | null | undefined): string {
  if (r === null || r === undefined) return "—";
  return `${Math.round(r * 100)}%`;
}