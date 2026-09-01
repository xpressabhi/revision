import { useEffect, useRef } from "react";
import { Icon } from "./ui";

export type ToastMsg = {
  id: number;
  kind: "success" | "warn" | "error" | "info";
  text: string;
  undo?: () => void;
};

export function Toasts({ toasts, onDone }: { toasts: ToastMsg[]; onDone: (id: number) => void }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <Toast key={t.id} t={t} onDone={onDone} />
      ))}
    </div>
  );
}

function Toast({ t, onDone }: { t: ToastMsg; onDone: (id: number) => void }) {
  const timer = useRef<number | null>(null);
  useEffect(() => {
    timer.current = window.setTimeout(() => onDone(t.id), 2200);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [t.id, onDone]);
  return (
    <div className={`toast ${t.kind}`} onClick={() => onDone(t.id)}>
      <span className="t-ico">
        <Icon name={t.kind === "success" ? "check" : t.kind === "error" ? "warn" : t.kind === "warn" ? "warn" : "info"} size={12} />
      </span>
      <span>{t.text}</span>
      {t.undo && (
        <button className="t-undo" onClick={(e) => { e.stopPropagation(); t.undo?.(); onDone(t.id); }}>
          Undo
        </button>
      )}
    </div>
  );
}