import { describe, expect, it } from "vitest";
import { formatInterval, intervalDays, isDue, nextState, predictIntervals, retrievability } from "./fsrs";
import type { CardState, Grade } from "./types";

function freshState(overrides: Partial<CardState> = {}): CardState {
  const now = new Date().toISOString();
  return {
    card_id: 1,
    due_at: now,
    interval: 0,
    ease: 2.5,
    reps: 0,
    state: "new",
    stability: 0,
    difficulty: 5,
    updated_at: now,
    ...overrides,
  };
}

describe("fsrs", () => {
  it("promotes a fresh card to review on a successful grade", () => {
    const ns = nextState(freshState(), 3);
    expect(ns.state).toBe("review");
    expect(ns.reps).toBe(1);
    expect(ns.stability).toBeGreaterThan(0);
    expect(new Date(ns.due_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("keeps a failed card in learning with a 10 minute step", () => {
    const ns = nextState(freshState(), 1);
    expect(ns.state).toBe("learning");
    expect(ns.interval).toBe(0);
    const minutes = (new Date(ns.due_at).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThan(11);
  });

  it("orders predicted intervals Again < Hard < Good < Easy for a new card", () => {
    const preds = predictIntervals(freshState());
    const byGrade = new Map(preds.map((p) => [p.key, p.days]));
    expect(byGrade.get(1)!).toBeLessThan(byGrade.get(2)!);
    expect(byGrade.get(2)!).toBeLessThan(byGrade.get(3)!);
    expect(byGrade.get(3)!).toBeLessThan(byGrade.get(4)!);
  });

  it("returns all four grade predictions", () => {
    expect(predictIntervals(freshState()).map((p) => p.key)).toEqual([1, 2, 3, 4]);
  });

  it("retrievability starts at 1 and decays", () => {
    expect(retrievability(0, 10)).toBeCloseTo(1, 5);
    expect(retrievability(30, 10)!).toBeLessThan(retrievability(1, 10)!);
    expect(retrievability(1, 0)).toBeNull();
  });

  it("target retention shifts intervals", () => {
    const relaxed = intervalDays(50, 0.8);
    const strict = intervalDays(50, 0.95);
    expect(strict).toBeLessThan(relaxed);
    expect(intervalDays(0)).toBe(0);
  });

  it("formats intervals and due checks", () => {
    expect(formatInterval(10 / 1440)).toBe("10m");
    expect(formatInterval(2)).toBe("2d");
    expect(formatInterval(60)).toBe("2mo");
    expect(isDue(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(isDue(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });

  it("grows stability after repeated successful reviews", () => {
    let state = freshState();
    let previous = 0;
    for (const grade of [3, 3, 3] as Grade[]) {
      state = { ...nextState(state, grade), updated_at: new Date(Date.now() - 5 * 86_400_000).toISOString() };
      expect(state.stability).toBeGreaterThan(previous);
      previous = state.stability;
    }
  });
});
