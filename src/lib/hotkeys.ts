// Central keyboard shortcut matrix — single source of truth for bindings and the help overlay.

export type Scope = "global" | "review" | "editor" | "capture";

export type Chord = {
  /** e.g. "mod+k" · "shift+g" · "1" · "space" · "ctrl+m" · "alt+1" */
  keys: string;
  label: string;
  scope: Scope;
  desc: string;
};

function normKey(e: KeyboardEvent): string {
  if (e.key === " ") return "space";
  return e.key.toLowerCase();
}

/** Match a chord string against a KeyboardEvent (⌘ = "mod", macOS-first). */
export function matchesChord(e: KeyboardEvent, chord: string): boolean {
  const parts = chord.split("+");
  const key = parts[parts.length - 1];
  const has = parts.slice(0, -1);
  if (normKey(e) !== key) return false;
  const modOk = has.includes("mod") === e.metaKey;
  const ctrlOk = has.includes("ctrl") === e.ctrlKey;
  const altOk = has.includes("alt") === e.altKey;
  const shiftOk = has.includes("shift") === e.shiftKey;
  return modOk && ctrlOk && altOk && shiftOk;
}

export const SHORTCUTS: Chord[] = [
  // Global
  { keys: "mod+k", label: "⌘K", scope: "global", desc: "Command bar (decks, cards, actions)" },
  { keys: "mod+shift+k", label: "⌘⇧K", scope: "global", desc: "Quick capture" },
  { keys: "mod+1", label: "⌘1", scope: "global", desc: "Dashboard" },
  { keys: "mod+2", label: "⌘2", scope: "global", desc: "Browse" },
  { keys: "mod+3", label: "⌘3", scope: "global", desc: "Review" },
  { keys: "mod+4", label: "⌘4", scope: "global", desc: "Analytics" },
  { keys: "mod+5", label: "⌘5", scope: "global", desc: "Settings" },
  { keys: "mod+s", label: "⌘S", scope: "global", desc: "Collapse sidebar → rail → hide" },
  { keys: "alt+mod+i", label: "⌥⌘I", scope: "global", desc: "Toggle inspector" },
  { keys: "mod+n", label: "⌘N", scope: "global", desc: "New card" },
  { keys: "mod+shift+t", label: "⌘⇧T", scope: "global", desc: "Cycle theme" },
  { keys: "mod+shift+f", label: "⌘⇧F", scope: "global", desc: "Focus mode" },
  { keys: "ctrl+mod+1", label: "⌘⌃1", scope: "global", desc: "Density: relaxed" },
  { keys: "ctrl+mod+2", label: "⌘⌃2", scope: "global", desc: "Density: standard" },
  { keys: "ctrl+mod+3", label: "⌘⌃3", scope: "global", desc: "Density: compact" },
  { keys: "mod+comma", label: "⌘,", scope: "global", desc: "Settings" },
  { keys: "slash", label: "/", scope: "global", desc: "Help overlay" },

  // Review
  { keys: "space", label: "Space", scope: "review", desc: "Flip card / advance" },
  { keys: "enter", label: "↵", scope: "review", desc: "Flip card / advance" },
  { keys: "1", label: "1", scope: "review", desc: "Grade: Again (10m)" },
  { keys: "2", label: "2", scope: "review", desc: "Grade: Hard (2d)" },
  { keys: "3", label: "3", scope: "review", desc: "Grade: Good (6d)" },
  { keys: "4", label: "4", scope: "review", desc: "Grade: Easy (14d)" },
  { keys: "g", label: "G", scope: "review", desc: "Reveal next cloze block" },
  { keys: "h", label: "H", scope: "review", desc: "Next AI hint (inspector)" },
  { keys: "e", label: "E", scope: "review", desc: "Edit card" },
  { keys: "s", label: "S", scope: "review", desc: "Suspend card" },
  { keys: "b", label: "B", scope: "review", desc: "Bury for this session" },
  { keys: "shift+g", label: "⇧G", scope: "review", desc: "Undo last grade" },
  { keys: "ctrl+arrowright", label: "⌃→", scope: "review", desc: "Skip card" },
  { keys: "mod+enter", label: "⌘↵", scope: "review", desc: "End session" },

  // Editor (modal)
  { keys: "mod+enter", label: "⌘↵", scope: "editor", desc: "Save card" },
  { keys: "escape", label: "Esc", scope: "editor", desc: "Discard / close" },
  { keys: "ctrl+m", label: "⌃M", scope: "editor", desc: "Inline math wrap" },
  { keys: "ctrl+shift+m", label: "⌃⇧M", scope: "editor", desc: "Display math wrap" },
  { keys: "ctrl+shift+c", label: "⌃⇧C", scope: "editor", desc: "Cloze wrap selection" },
  { keys: "ctrl+shift+d", label: "⌃⇧D", scope: "editor", desc: "AI generator drawer" },
  { keys: "ctrl+f", label: "⌃F", scope: "editor", desc: "Focus preview pane" },

  // Capture
  { keys: "mod+enter", label: "⌘↵", scope: "capture", desc: "Save flashcard" },
  { keys: "escape", label: "Esc", scope: "capture", desc: "Close" },
];

export function chordOf(keys: string): string {
  const c = SHORTCUTS.find((s) => s.keys === keys);
  return c ? c.label : keys;
}

export function scopeKeys(scope: Scope): Chord[] {
  return SHORTCUTS.filter((s) => s.scope === scope || s.scope === "global");
}