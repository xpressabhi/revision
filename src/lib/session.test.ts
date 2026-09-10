import { describe, expect, it } from "vitest";
import { isAutoEnd, isStale } from "./session";

describe("session", () => {
  const now = 10_000_000;

  it("treats idle time at the threshold as stale", () => {
    expect(isStale(now - 3 * 60_000, now, 3)).toBe(true);
    expect(isStale(now - 3 * 60_000 + 1, now, 3)).toBe(false);
  });

  it("never flags stale when the threshold is off", () => {
    expect(isStale(0, now, 0)).toBe(false);
  });

  it("auto-ends only after the longer idle window", () => {
    expect(isAutoEnd(now - 15 * 60_000, now, 15)).toBe(true);
    expect(isAutoEnd(now - 14 * 60_000, now, 15)).toBe(false);
  });
});
