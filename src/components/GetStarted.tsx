import { useEffect } from "react";
import { GUIDE_STEP_IDS, doneCount, stepsFor, type GetStartedState, type GuideAction, type GuideStepId } from "../lib/getStarted";
import { Icon } from "./ui";

type Props = {
  isTauri: boolean;
  state: GetStartedState;
  onClose: () => void;
  onDismissForever: () => void;
  onAction: (action: GuideAction, step: GuideStepId) => void;
};

export function GetStarted({ isTauri, state, onClose, onDismissForever, onAction }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const steps = stepsFor(isTauri ? "desktop" : "web", !isTauri);
  const done = doneCount(state);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal guide-modal" role="dialog" aria-modal="true" aria-label="Get started with Revision">
        <div className="modal-head">
          <img className="tb-logo" src="/revision-logo.png" alt="" draggable={false} />
          <span className="mh-title">Get started with Revision</span>
          <span className="chip" style={{ marginLeft: 4 }}>{done}/{GUIDE_STEP_IDS.length} done</span>
          <div style={{ marginLeft: "auto" }}>
            <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close setup guide">Close <span className="mono" style={{ fontSize: 9.5, opacity: 0.6 }}>esc</span></button>
          </div>
        </div>

        <div className="guide-body">
          <p className="guide-intro">
            {isTauri
              ? "You're in the desktop app. Four steps and Revision is set up the way you study."
              : "You're in the web app — everything stays in this browser. Four steps and you're ready."}
          </p>
          {steps.map((step, i) => {
            const isDone = state.done.includes(step.id);
            return (
              <div key={step.id} className={`guide-step ${isDone ? "done" : ""}`}>
                <span className="gs-check">{isDone ? <Icon name="check" size={13} /> : i + 1}</span>
                <div className="gs-main">
                  <div className="gs-title">{step.title}</div>
                  <div className="gs-body">{step.body}</div>
                  <div className="gs-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => onAction(step.primary.action, step.id)}>
                      {step.primary.label}
                    </button>
                    {step.secondary && (
                      <button className="btn btn-sm" onClick={() => onAction(step.secondary!.action, step.id)}>
                        {step.secondary.label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="guide-foot">
          <button className="btn btn-sm btn-ghost" onClick={onDismissForever} title="Hide the guide until you reset it from the keyboard overlay">
            Don't show again
          </button>
          <span className="spacer" />
          <button className="btn btn-sm" onClick={onClose}>Skip for now</button>
        </div>
      </div>
    </div>
  );
}
