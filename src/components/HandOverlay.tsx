import { useEffect, useRef, useState } from "react";
import type { Grade } from "../lib/types";
import { HandGestureDetector, type HandGesture } from "../lib/handGestures";
import { DIR_GRADE, type DragDir } from "../lib/gestures";

type Props = {
  shown: boolean;
  onFlip: () => void;
  onGrade: (g: Grade) => void;
};

type Status = "starting" | "ready" | "denied" | "nocamera" | "unsupported" | "timeout" | "error";

const GRADE_LABEL: Record<Grade, string> = { 1: "AGAIN", 2: "HARD", 3: "GOOD", 4: "EASY" };
const DIR_LABEL: Record<DragDir, string> = { left: "←", right: "→", up: "↑", down: "↓" };

export function HandOverlay({ shown, onFlip, onGrade }: Props) {
  const [status, setStatus] = useState<Status>("starting");
  const [handSeen, setHandSeen] = useState(false);
  const [lastGesture, setLastGesture] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    shown,
    onFlip,
    onGrade,
    stream: null as MediaStream | null,
    raf: 0,
    detector: null as HandGestureDetector | null,
    landmarker: null as { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks?: { x: number; y: number; z: number }[][] } } | null,
    lastStatus: "starting" as Status,
    lastSeen: false,
    gestureAt: 0,
    watchdog: 0,
  });
  stateRef.current.shown = shown;
  stateRef.current.onFlip = onFlip;
  stateRef.current.onGrade = onGrade;

  useEffect(() => {
    let cancelled = false;
    const s = stateRef.current;

    const setStatusNow = (st: Status) => {
      s.lastStatus = st;
      if (!cancelled) setStatus(st);
    };
    const setSeen = (v: boolean) => {
      if (s.lastSeen === v) return;
      s.lastSeen = v;
      if (!cancelled) setHandSeen(v);
    };

    const draw = (lm: { x: number; y: number }[]) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const dpr = 2;
      canvas.width = video.clientWidth * dpr;
      canvas.height = video.clientHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const sx = canvas.width;
      const sy = canvas.height;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = "rgba(59,226,139,0.9)";
      ctx.lineCap = "round";
      const pairs = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16],
        [13, 17], [17, 18], [18, 19], [19, 20],
        [0, 17],
      ];
      for (const [a, b] of pairs) {
        ctx.beginPath();
        ctx.moveTo(lm[a].x * sx, lm[a].y * sy);
        ctx.lineTo(lm[b].x * sx, lm[b].y * sy);
        ctx.stroke();
      }
      for (const p of lm) {
        ctx.beginPath();
        ctx.arc(p.x * sx, p.y * sy, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(59,226,139,0.95)";
        ctx.fill();
      }
    };

    const handleGesture = (g: HandGesture) => {
      if (!cancelled && performance.now() - s.gestureAt > 650) {
        s.gestureAt = performance.now();
        const revealed = s.shown;
        if (g.kind === "pinch") {
          if (!revealed) {
            s.onFlip();
            setLastGesture("PINCH ✓");
          }
        } else {
          if (revealed) {
            const gr = DIR_GRADE[g.dir];
            s.onGrade(gr);
            setLastGesture(`${DIR_LABEL[g.dir]} ${GRADE_LABEL[gr]}`);
          } else {
            s.onFlip();
            setLastGesture("FLIP ✓");
          }
        }
        window.setTimeout(() => { if (!cancelled) setLastGesture(null); }, 700);
      }
    };

    const start = async () => {
      setStatusNow("starting");
      const watchdog = window.setTimeout(() => {
        if (s.lastStatus === "starting") setStatusNow("timeout");
      }, 10000);
      s.watchdog = watchdog;
      const nav = navigator as Navigator & { mediaDevices?: MediaDevices };
      if (!nav.mediaDevices?.getUserMedia) {
        setStatusNow("unsupported");
        return;
      }
      let stream: MediaStream;
      try {
        stream = await nav.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        setStatusNow(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "nocamera" : "error");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      s.stream = stream;
      window.clearTimeout(s.watchdog);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }

      let landmarker: typeof s.landmarker = null;
      try {
        const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task", delegate: "GPU" },
            numHands: 1,
            runningMode: "VIDEO",
          });
        } catch {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task", delegate: "CPU" },
            numHands: 1,
            runningMode: "VIDEO",
          });
        }
      } catch {
        setStatusNow("error");
        return;
      }
      if (cancelled) return;
      s.landmarker = landmarker;
      s.detector = new HandGestureDetector();
      setStatusNow("ready");

      const loop = async () => {
        if (cancelled) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && s.landmarker && s.detector) {
          try {
            const res = s.landmarker.detectForVideo(v, performance.now());
            if (res.landmarks && res.landmarks.length > 0) {
              setSeen(true);
              draw(res.landmarks[0]);
              const g = s.detector.update(res.landmarks[0], performance.now());
              if (g) handleGesture(g);
            } else {
              setSeen(false);
              const canvas = canvasRef.current;
              if (canvas) {
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
              }
            }
          } catch {}
        }
        s.raf = requestAnimationFrame(loop);
      };
      s.raf = requestAnimationFrame(loop);
    };

    void start();

    return () => {
      cancelled = true;
      window.clearTimeout(s.watchdog);
      cancelAnimationFrame(s.raf);
      s.detector = null;
      s.landmarker = null;
      if (s.stream) {
        s.stream.getTracks().forEach((t) => t.stop());
        s.stream = null;
      }
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
  }, []);

  const statusLabel =
    status === "starting" ? "starting camera…" :
    status === "ready" ? (handSeen ? "hand detected" : "raise your hand into view") :
    status === "denied" ? "camera denied. Enable it in System Settings." :
    status === "nocamera" ? "no camera found" :
    status === "unsupported" ? "camera not supported in this build" :
    status === "timeout" ? "camera is slow to start. Check the permission prompt" :
    "camera error (try toggling the setting)";

  return (
    <div className="hand-overlay" ref={wrapRef}>
      <div className="hand-video" data-hidden={status !== "ready"}>
        <video ref={videoRef} muted playsInline autoPlay />
        <canvas ref={canvasRef} />
      </div>
      {lastGesture && <div className="hand-gesture-chip">{lastGesture}</div>}
      <div className={`hand-status ${status === "ready" && handSeen ? "live" : status === "denied" || status === "error" ? "bad" : ""}`}>
        <span className="dot" />
        {statusLabel}
      </div>
    </div>
  );
}