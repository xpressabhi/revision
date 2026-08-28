import type { CardState, Grade } from "./types";

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function nextState(
  state: CardState,
  grade: Grade,
  now: Date = new Date()
): CardState {
  let { interval, ease, reps, state: cardState } = state;
  let nextInterval = interval;
  let nextEase = ease;
  let nextStateStr: CardState["state"] = cardState;
  let dueAt: Date;

  if (grade === 1) {
    // Again: reset, penalize ease, due in 10 min (still due today)
    nextEase = Math.max(MIN_EASE, ease - 0.2);
    nextInterval = 0;
    nextStateStr = "learning";
    reps = 0;
    dueAt = addMinutes(now, 10);
  } else if (grade === 3) {
    // Good
    if (cardState === "new" || cardState === "learning") {
      nextInterval = 1;
      nextStateStr = "review";
    } else {
      nextInterval = Math.max(1, Math.round(interval * ease));
      nextStateStr = "review";
    }
    nextEase = ease;
    reps = reps + 1;
    dueAt = addDays(now, nextInterval);
  } else {
    // Easy (4)
    if (cardState === "new" || cardState === "learning") {
      nextInterval = 3;
      nextStateStr = "review";
    } else {
      nextInterval = Math.max(1, Math.round(interval * ease * 1.3));
      nextStateStr = "review";
    }
    nextEase = Math.min(3.0, ease + 0.15);
    reps = reps + 1;
    dueAt = addDays(now, nextInterval);
  }

  return {
    card_id: state.card_id,
    due_at: dueAt.toISOString(),
    interval: nextInterval,
    ease: Number(nextEase.toFixed(2)),
    reps,
    state: nextStateStr,
    updated_at: now.toISOString(),
  };
}

export function isDue(dueAt: string, now: Date = new Date()): boolean {
  return new Date(dueAt).getTime() <= now.getTime();
}

export function formatDue(dueAt: string): string {
  const d = new Date(dueAt);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin <= 0) return "due now";
  if (diffMin < 60) return `in ${diffMin}m`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `in ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return "in 1 day";
  return `in ${diffDays} days`;
}
