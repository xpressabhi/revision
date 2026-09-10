import { describe, expect, it } from "vitest";
import { defaultState, dismiss, doneCount, isComplete, markSeen, markStep, parseState, stepsFor } from "./getStarted";

describe("getStarted state", () => {
  it("starts empty and unseen", () => {
    const s = defaultState();
    expect(s).toMatchObject({ seen: false, hidden: false, done: [] });
    expect(doneCount(s)).toBe(0);
    expect(isComplete(s)).toBe(false);
  });

  it("parses stored state and drops unknown step ids", () => {
    const s = parseState(JSON.stringify({ seen: true, hidden: true, done: ["review", "bogus", "review"] }));
    expect(s.seen).toBe(true);
    expect(s.hidden).toBe(true);
    expect(s.done).toEqual(["review"]);
  });

  it("recovers from corrupt storage", () => {
    expect(parseState("not json")).toEqual(defaultState());
    expect(parseState(null)).toEqual(defaultState());
  });

  it("marks steps once and stamps completion", () => {
    let s = defaultState();
    s = markStep(s, "review");
    s = markStep(s, "review");
    expect(s.done).toEqual(["review"]);
    s = markStep(s, "cards");
    s = markStep(s, "settings");
    expect(s.completedAt).toBeNull();
    s = markStep(s, "everywhere");
    expect(isComplete(s)).toBe(true);
    expect(s.completedAt).toBeTruthy();
  });

  it("markSeen and dismiss are idempotent-ish", () => {
    const seen = markSeen(defaultState());
    expect(seen.seen).toBe(true);
    const skipped = dismiss(seen, false);
    expect(skipped.hidden).toBe(false);
    expect(skipped.dismissedAt).toBeTruthy();
    const hidden = dismiss(skipped, true);
    expect(hidden.hidden).toBe(true);
  });
});

describe("stepsFor", () => {
  it("uses web copy and points at the desktop download", () => {
    const steps = stepsFor("web");
    expect(steps.map((s) => s.id)).toEqual(["review", "cards", "settings", "everywhere"]);
    expect(steps[3].primary.action).toBe("releases");
    expect(steps[1].body).not.toContain("Anki");
  });

  it("uses desktop copy, Anki mention and sync primary", () => {
    const steps = stepsFor("desktop");
    expect(steps[1].body).toContain("Anki");
    expect(steps[3].primary.action).toBe("sync");
    expect(steps[3].secondary).toBeUndefined();
  });

  it("adds the web app shortcut only when a URL exists", () => {
    const withUrl = stepsFor("desktop", true);
    expect(withUrl[3].secondary?.action).toBe("webapp");
  });
});
