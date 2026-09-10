import { describe, expect, it } from "vitest";
import { HandGestureDetector } from "./handGestures";

function spreadHand(x: number, y = 0.5): { x: number; y: number }[] {
  const lm = Array.from({ length: 21 }, () => ({ x, y }));
  lm[4] = { x, y }; // thumb tip
  lm[8] = { x: x + 0.2, y }; // index tip far from thumb
  lm[12] = { x: x + 0.2, y: y + 0.2 };
  lm[16] = { x: x + 0.2, y: y - 0.2 };
  lm[20] = { x: x + 0.2, y: y + 0.3 };
  return lm;
}

function pinchingHand(x: number, y = 0.5): { x: number; y: number }[] {
  const lm = spreadHand(x, y);
  lm[8] = { x, y: y + 0.03 }; // index tip within PINCH_DIST of thumb
  return lm;
}

describe("handGestures", () => {
  it("detects a pinch edge and respects the cooldown", () => {
    const detector = new HandGestureDetector();
    expect(detector.update(spreadHand(0.5), 1000)).toBeNull();
    expect(detector.update(pinchingHand(0.5), 1100)).toEqual({ kind: "pinch" });
    expect(detector.update(pinchingHand(0.5), 1200)).toBeNull();
    expect(detector.update(spreadHand(0.5), 1300)).toBeNull();
    expect(detector.update(pinchingHand(0.5), 1400)).toBeNull();
  });

  it("detects a rightward swipe after enough travel", () => {
    const detector = new HandGestureDetector();
    let t = 1000;
    expect(detector.update(spreadHand(0.2), t)).toBeNull();
    t += 120;
    expect(detector.update(spreadHand(0.35), t)).toBeNull();
    t += 30;
    detector.update(spreadHand(0.45), t);
    t += 30;
    detector.update(spreadHand(0.55), t);
    t += 30;
    const gesture = detector.update(spreadHand(0.68), t);
    expect(gesture).toEqual({ kind: "swipe", dir: "right" });
  });

  it("does not fire a swipe for small movements", () => {
    const detector = new HandGestureDetector();
    let t = 1000;
    detector.update(spreadHand(0.5), t);
    for (let i = 0; i < 5; i++) {
      t += 60;
      expect(detector.update(spreadHand(0.5 + i * 0.005), t)).toBeNull();
    }
  });
});
