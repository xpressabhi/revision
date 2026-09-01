// FSRS-5 inspired scheduler (Free Spaced Repetition Scheduler)
// Open-source model: R(t) = (1 + 19/81 · t/S)^-0.5 · Stability/Difficulty dynamics with
// the published FSRS-5 default weights. Deterministic, offline, per-card.

import type { CardState, Grade } from "./types";

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const DEFAULT_STABILITY = 0;
export const DEFAULT_DIFFICULTY = 5.0;

/** FSRS math operates on the state fields; card_id is optional in practice. */
export type FsrsState = Omit<CardState, "card_id"> & { card_id?: number };

// FSRS-5 default weights (minutes for short-term, days for long-term)
const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
const AGAIN_STEP_MIN = 10; // learning step for Again (minutes)
const MIN_INTERVAL_DAYS = 1;

export function constrainDifficulty(d: number): number {
  return Math.min(10, Math.max(1, d));
}

/** Retrievability R(t) given stability S (days) and elapsed t (days). */
export function retrievability(tDays: number, stability: number): number | null {
  if (stability <= 0) return null;
  return Math.pow(1 + (FACTOR * tDays) / stability, DECAY);
}

/** Elapsed days between two ISO timestamps (minimum 0). */
export function elapsedDays(fromIso: string, to: Date = new Date()): number {
  const t = (to.getTime() - new Date(fromIso).getTime()) / 86_400_000;
  return Math.max(0, t);
}

function initialStability(grade: Grade): number {
  return W[grade - 1];
}

function initialDifficulty(grade: Grade): number {
  return constrainDifficulty(W[4] - Math.exp(W[5] * (grade - 1)) + 1);
}

function nextDifficulty(D: number, r: number, grade: Grade): number {
  const delta = -W[6] * (grade - 3);
  return constrainDifficulty(D + delta * (Math.exp(W[7] * (1 - r)) - 1));
}

function nextStability(S: number, D: number, r: number, grade: Grade): number {
  if (grade === 1) {
    return W[11] * Math.pow(D, -W[12]) * ((Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
  }
  const hardPenalty = grade === 2 ? W[15] : 1;
  const easyBonus = grade === 4 ? W[16] : 1;
  // FSRS-4.5/5 form: e^w8 · (11 − D) — gentle growth at high retrievability
  return (
    S *
    (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1)) *
    hardPenalty *
    easyBonus
  );
}

/** Days until R(t) decays to the desired retention (default 0.90). */
export function intervalDays(stability: number, desiredRetention = 0.9): number {
  if (stability <= 0) return 0;
  const t = (stability * (Math.pow(desiredRetention, 1 / DECAY) - 1)) / FACTOR;
  return Math.max(MIN_INTERVAL_DAYS, t);
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

/**
 * FSRS state transition for a card.
 * Preserves Anki-style learning steps: Again → 10m step (state=learning);
 * successful first answers promote to review with FSRS long-term intervals.
 */
export function nextState(
  state: FsrsState,
  grade: Grade,
  now: Date = new Date(),
  desiredRetention = 0.9,
): CardState {
  const at = now.toISOString();
  const S = state.stability > 0 ? state.stability : DEFAULT_STABILITY;
  const isFresh = state.reps === 0 && state.state === "new";
  const D = state.difficulty > 0 && !isFresh ? state.difficulty : initialDifficulty(grade);
  const r = isFresh ? 1 : retrievability(elapsedDays(state.updated_at, now), S) ?? 1;

  if (grade === 1) {
    const nextStab = isFresh ? initialStability(1) : nextStability(S, D, r, 1);
    return {
      card_id: state.card_id ?? 0,
      due_at: addMinutes(at, AGAIN_STEP_MIN),
      interval: 0,
      ease: state.ease,
      reps: 0,
      state: "learning",
      stability: Number(nextStab.toFixed(4)),
      difficulty: nextDifficulty(D, r, 1),
      updated_at: at,
    };
  }

  const stab = isFresh ? initialStability(grade) : nextStability(S, D, r, grade);
  const interval = intervalDays(stab, desiredRetention);
  const factor = grade === 4 ? 1.3 : 1;

  return {
    card_id: state.card_id ?? 0,
    due_at: addDays(at, interval * factor),
    interval: Number((interval * factor).toFixed(2)),
    ease: Math.min(3.0, Math.max(1.3, state.ease + (grade === 4 ? 0.15 : 0))),
    reps: state.reps + 1,
    state: "review",
    stability: Number(stab.toFixed(4)),
    difficulty: nextDifficulty(D, r, grade),
    updated_at: at,
  };
}

export type IntervalPrediction = { key: Grade; label: string; days: number; retention: number | null };

/** Predict the four grading-bar outcomes for the current state, live. */
export function predictIntervals(state: FsrsState, desiredRetention = 0.9): IntervalPrediction[] {
  const now = new Date();
  const grades: Grade[] = [1, 2, 3, 4];
  return grades.map((g) => {
    const ns = nextState(state, g, now, desiredRetention);
    const days = ns.state === "learning" ? 10 / 60 / 24 : (new Date(ns.due_at).getTime() - now.getTime()) / 86_400_000;
    return { key: g, label: formatInterval(days), days, retention: ns.stability > 0 ? retrievability(days, ns.stability) : null };
  });
}

/** Human interval labels: "10m" · "2d" · "6d" · "14d" */
export function formatInterval(days: number): string {
  if (days <= 0) return "now";
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))}m`;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

export function isDue(dueAt: string, now: Date = new Date()): boolean {
  return new Date(dueAt).getTime() <= now.getTime();
}

export function dueInLabel(dueAt: string, now: Date = new Date()): string {
  const diffMs = new Date(dueAt).getTime() - now.getTime();
  const diffMin = diffMs / 60000;
  if (diffMin <= 0) return "due now";
  return formatInterval(diffMin / 1440);
}

/** Optionally compute current retrievability for a card using its last review time. */
export function cardRetrievability(
  state: FsrsState,
  lastReviewIso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (state.state === "new") return null;
  if (state.stability <= 0) return null;
  const anchor = lastReviewIso ? lastReviewIso : state.updated_at;
  return retrievability(elapsedDays(anchor, now), state.stability);
}