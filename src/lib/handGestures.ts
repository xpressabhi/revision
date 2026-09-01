import type { DragDir } from "./gestures";

export type HandGesture = { kind: "pinch" } | { kind: "swipe"; dir: DragDir };

type LM = { x: number; y: number };

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;

const PINCH_DIST = 0.055;
const PINCH_FAR = 0.11;
const PINCH_COOLDOWN = 600;

const SWIPE_WINDOW_MS = 110;
const SWIPE_MOVE = 0.085;
const SWIPE_DIST = 0.3;
const SWIPE_COOLDOWN = 900;
const SWIPE_RESET_DIST = 0.1;
const SWIPE_TIMEOUT = 650;

export class HandGestureDetector {
  private hist: { x: number; y: number; t: number }[] = [];
  private prevFing: { pinch: boolean } = { pinch: false };
  private lastPinchAt = 0;
  private swipeDir: DragDir | null = null;
  private swAxisX = 0;
  private swAxisY = 0;
  private swStart = { x: 0, y: 0, t: 0 };
  private traveled = 0;
  private firedAt = 0;
  private resetPos = { x: 0, y: 0 };

  reset() {
    this.hist = [];
    this.swipeDir = null;
    this.prevFing.pinch = false;
    this.fire(0);
  }

  private fire(now: number) {
    this.firedAt = now;
    this.swipeDir = null;
    this.traveled = 0;
  }

  update(landmarks: LM[], now: number): HandGesture | null {
    const cx = landmarks.reduce((a, l) => a + l.x, 0) / landmarks.length;
    const cy = landmarks.reduce((a, l) => a + l.y, 0) / landmarks.length;
    this.hist.push({ x: cx, y: cy, t: now });
    while (this.hist.length && now - this.hist[0].t > 700) this.hist.shift();

    if (this.updatePinch(landmarks, now)) return { kind: "pinch" };

    const swipe = this.updateSwipe(cx, cy, now);
    if (swipe) return { kind: "swipe", dir: swipe };
    return null;
  }

  private updatePinch(lm: LM[], now: number): boolean {
    const dThumbIndex = Math.hypot(lm[THUMB_TIP].x - lm[INDEX_TIP].x, lm[THUMB_TIP].y - lm[INDEX_TIP].y);
    const dMiddle = Math.hypot(lm[THUMB_TIP].x - lm[MIDDLE_TIP].x, lm[THUMB_TIP].y - lm[MIDDLE_TIP].y);
    const dRing = Math.hypot(lm[THUMB_TIP].x - lm[RING_TIP].x, lm[THUMB_TIP].y - lm[RING_TIP].y);
    const dPinky = Math.hypot(lm[THUMB_TIP].x - lm[PINKY_TIP].x, lm[THUMB_TIP].y - lm[PINKY_TIP].y);
    const pinched = dThumbIndex < PINCH_DIST && dMiddle > PINCH_FAR && dRing > PINCH_FAR && dPinky > PINCH_FAR;
    const edge = pinched && !this.prevFing.pinch;
    this.prevFing.pinch = pinched;
    if (edge && now - this.lastPinchAt > PINCH_COOLDOWN) {
      this.lastPinchAt = now;
      return true;
    }
    return false;
  }

  private updateSwipe(cx: number, cy: number, now: number): DragDir | null {
    if (now - this.firedAt < SWIPE_COOLDOWN) {
      const back = Math.hypot(cx - this.resetPos.x, cy - this.resetPos.y);
      if (back > SWIPE_RESET_DIST) this.firedAt = 0;
      return null;
    }
    if (now - this.lastPinchAt < PINCH_COOLDOWN) return null;

    if (!this.swipeDir) {
      const windowStart = now - SWIPE_WINDOW_MS;
      let old: { x: number; y: number; t: number } | null = null;
      for (let i = 0; i < this.hist.length; i++) {
        if (this.hist[i].t <= windowStart) old = this.hist[i];
        else break;
      }
      if (!old || now - old.t < 50) return null;
      const dx = cx - old.x;
      const dy = cy - old.y;
      if (Math.hypot(dx, dy) < SWIPE_MOVE) return null;
      const dir: DragDir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      this.swipeDir = dir;
      this.swAxisX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
      this.swAxisY = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
      this.swStart = { x: cx, y: cy, t: now };
      this.traveled = Math.hypot(dx, dy);
      return null;
    }

    const proj = (cx - this.swStart.x) * this.swAxisX + (cy - this.swStart.y) * this.swAxisY;
    if (proj > this.traveled) this.traveled = proj;

    if (now - this.swStart.t > SWIPE_TIMEOUT) {
      this.swipeDir = null;
      this.traveled = 0;
      return null;
    }

    if (this.traveled >= SWIPE_DIST) {
      const dir = this.swipeDir;
      this.resetPos = { x: cx, y: cy };
      this.fire(now);
      return dir;
    }
    return null;
  }
}