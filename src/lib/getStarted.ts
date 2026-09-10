export type GuideStepId = "review" | "cards" | "settings" | "everywhere";

export type GuideAction = "review" | "newCard" | "import" | "settings" | "sync" | "releases" | "webapp" | "help";

export type GuideStep = {
  id: GuideStepId;
  title: string;
  body: string;
  primary: { action: GuideAction; label: string };
  secondary?: { action: GuideAction; label: string };
};

export type GetStartedState = {
  seen: boolean;
  hidden: boolean;
  done: GuideStepId[];
  dismissedAt: string | null;
  completedAt: string | null;
};

export const GUIDE_KEY = "recall_getstarted_v1";
export const GUIDE_STEP_IDS: GuideStepId[] = ["review", "cards", "settings", "everywhere"];

export function defaultState(): GetStartedState {
  return { seen: false, hidden: false, done: [], dismissedAt: null, completedAt: null };
}

export function parseState(raw: string | null): GetStartedState {
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw) as Partial<GetStartedState>;
    const done = Array.isArray(parsed.done) ? parsed.done.filter((d): d is GuideStepId => GUIDE_STEP_IDS.includes(d as GuideStepId)) : [];
    return {
      seen: parsed.seen === true,
      hidden: parsed.hidden === true,
      done: [...new Set(done)],
      dismissedAt: typeof parsed.dismissedAt === "string" ? parsed.dismissedAt : null,
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : null,
    };
  } catch {
    return defaultState();
  }
}

export function doneCount(state: GetStartedState): number {
  return state.done.length;
}

export function isComplete(state: GetStartedState): boolean {
  return state.done.length >= GUIDE_STEP_IDS.length;
}

export function markSeen(state: GetStartedState): GetStartedState {
  return { ...state, seen: true };
}

export function markStep(state: GetStartedState, id: GuideStepId): GetStartedState {
  if (state.done.includes(id)) return state;
  const done = [...state.done, id];
  return { ...state, done, completedAt: done.length >= GUIDE_STEP_IDS.length ? new Date().toISOString() : state.completedAt };
}

export function dismiss(state: GetStartedState, forever: boolean): GetStartedState {
  return { ...state, seen: true, hidden: forever || state.hidden, dismissedAt: new Date().toISOString() };
}

export function stepsFor(platform: "web" | "desktop", hasWebAppUrl = false): GuideStep[] {
  return [
    {
      id: "review",
      title: "Learn the review loop",
      body: "Flip with Space or a click, then grade with 1–4 — or drag ← Again · → Good · ↑ Easy · ↓ Hard. Every button shows the FSRS interval it will schedule.",
      primary: { action: "review", label: "Start first review" },
      secondary: { action: "help", label: "Keyboard map" },
    },
    {
      id: "cards",
      title: "Add your cards",
      body:
        platform === "desktop"
          ? "Type a card, paste text, or import CSV, Chrome bookmarks and Anki .apkg decks."
          : "Type a card, paste text, or import CSV and Chrome bookmarks.",
      primary: { action: "newCard", label: "New card" },
      secondary: { action: "import", label: "Import" },
    },
    {
      id: "settings",
      title: "Tune the schedule",
      body: "Pick a target retention between 80–95%, set daily new/review limits, and choose a theme or density.",
      primary: { action: "settings", label: "Open settings" },
    },
    platform === "desktop"
      ? {
          id: "everywhere",
          title: "Sync with the browser",
          body: "Attach one JSON file here and in the web app, then hit Sync now — cards, scheduling and review history merge both ways.",
          primary: { action: "sync", label: "Set up sync" },
          ...(hasWebAppUrl ? { secondary: { action: "webapp" as GuideAction, label: "Open the web app" } } : {}),
        }
      : {
          id: "everywhere",
          title: "Take it to the desktop",
          body: "The desktop app adds a menu-bar tray, global ⌥⇧K capture and Anki import. Already have it? Pair the two with one JSON file.",
          primary: { action: "releases", label: "Download the desktop app" },
          secondary: { action: "sync", label: "Set up sync" },
        },
  ];
}

export function loadState(): GetStartedState {
  try {
    if (typeof localStorage === "undefined") return defaultState();
    return parseState(localStorage.getItem(GUIDE_KEY));
  } catch {
    return defaultState();
  }
}

export function saveState(state: GetStartedState): GetStartedState {
  try {
    localStorage.setItem(GUIDE_KEY, JSON.stringify(state));
  } catch {}
  return state;
}
