import { useEffect, useRef, useState } from "react";
import type { Grade } from "./types";

export type DragDir = "left" | "right" | "up" | "down";
export type DragPhase = "idle" | "dragging" | "flying";

export type DragState = {
  phase: DragPhase;
  dir: DragDir | null;
  x: number;
  y: number;
};

export type DragCallbacks = {
  onTap: () => void;
  onFlip: () => void;
  onGrade: (g: Grade) => void;
};

export const DIR_GRADE: Record<DragDir, Grade> = { left: 1, right: 3, up: 4, down: 2 };

const DEADZONE = 6;
const TAP_MAX_MOVE = 10;
const TAP_MAX_MS = 260;
const FLIP_THRESHOLD = 64;
const GRADE_THRESHOLD = 118;
const MAX_DIST = 260;
const FLY_MS = 230;
const FLIP_FLY_MS = 170;

export function useDragGesture(shown: boolean, cb: DragCallbacks) {
  const [state, setState] = useState<DragState>({ phase: "idle", dir: null, x: 0, y: 0 });
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const g = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    startT: 0,
    claimed: false,
    touch: false,
    flyTimer: 0 as number | undefined,
    gestureActive: false,
  }).current;

  const setGesturing = (on: boolean) => {
    if (g.gestureActive === on) return;
    g.gestureActive = on;
    document.body.classList.toggle("gesture-active", on);
  };

  const reset = () => {
    setGesturing(false);
    setState({ phase: "idle", dir: null, x: 0, y: 0 });
    g.pointerId = -1;
    g.claimed = false;
  };

  useEffect(() => {
    return () => {
      if (g.flyTimer) window.clearTimeout(g.flyTimer);
      document.body.classList.remove("gesture-active");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (state.phase === "flying") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("a, button, input, textarea, select, [data-no-gesture]")) return;
    g.pointerId = e.pointerId;
    g.startX = e.clientX;
    g.startY = e.clientY;
    g.startT = performance.now();
    g.claimed = false;
    g.touch = e.pointerType === "touch";
    setState({ phase: "idle", dir: null, x: 0, y: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (!g.claimed) {
      if (adx + ady < DEADZONE) return;
      if (g.touch && ady > adx) return;
      g.claimed = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setGesturing(true);
    }

    const dir: DragDir = adx >= ady ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    const scale = Math.min(1, MAX_DIST / Math.max(MAX_DIST, Math.max(adx, ady)));
    setState({ phase: "dragging", dir, x: dx * scale, y: dy * scale });
  };

  const commit = (e: React.PointerEvent) => {
    if (g.pointerId !== e.pointerId && e.pointerType !== "touch") return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const mag = Math.hypot(dx, dy);
    const elapsed = performance.now() - g.startT;
    const shownAtRelease = shownRef.current;

    if (!g.claimed) {
      if (mag < TAP_MAX_MOVE && elapsed < TAP_MAX_MS) cbRef.current.onTap();
      reset();
      return;
    }

    const threshold = shownAtRelease ? GRADE_THRESHOLD : FLIP_THRESHOLD;
    if (mag < threshold) {
      reset();
      return;
    }

    const dir: DragDir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    const ox = (dir === "left" ? -1 : dir === "right" ? 1 : 0) * 560;
    const oy = (dir === "up" ? -1 : dir === "down" ? 1 : 0) * 420;
    setGesturing(false);
    setState({ phase: "flying", dir, x: ox, y: oy });
    g.flyTimer = window.setTimeout(() => {
      setState({ phase: "idle", dir: null, x: 0, y: 0 });
      g.pointerId = -1;
      g.claimed = false;
      if (shownAtRelease) cbRef.current.onGrade(DIR_GRADE[dir]);
      else cbRef.current.onFlip();
    }, shownAtRelease ? FLY_MS : FLIP_FLY_MS);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (g.pointerId !== e.pointerId) return;
    commit(e);
  };

  const onPointerCancel = () => {
    if (g.pointerId === -1) return;
    reset();
  };

  return {
    state,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onDragStart: (e: React.DragEvent) => e.preventDefault(),
    },
  };
}

export function dragTransform(s: DragState, shown: boolean): React.CSSProperties | undefined {
  if (s.phase === "idle") return undefined;
  return {
    transform: `translate3d(${s.x}px, ${s.y}px, 0) rotate(${s.x * 0.045}deg)${shown ? " rotateY(180deg)" : ""}`,
  };
}