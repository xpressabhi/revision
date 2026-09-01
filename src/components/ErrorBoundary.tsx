import { Component, type ReactNode } from "react";

type State = { error: { message: string; stack?: string } | null };

/**
 * Catches render-time crashes, shows a red banner (so a "blank window" never
 * hides the failure) and forwards the details to the Rust side (visible in
 * `tauri dev` / terminal output) plus the JS console.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: unknown): State {
    return { error: { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined } };
  }

  componentDidCatch(err: unknown) {
    this.report(err);
  }

  componentDidMount() {
    window.addEventListener("unhandledrejection", this.onRejection);
    window.addEventListener("error", this.onError);
  }

  componentWillUnmount() {
    window.removeEventListener("unhandledrejection", this.onRejection);
    window.removeEventListener("error", this.onError);
  }

  private onRejection = (e: PromiseRejectionEvent) => {
    const err = e.reason;
    this.report(err instanceof Error ? err : new Error(String(err)));
  };

  private onError = (e: ErrorEvent) => {
    if (e.message) this.report(new Error(e.message));
  };

  private report(err: unknown) {
    const message = err instanceof Error ? `${err.message}${err.stack ? `\n${err.stack.split("\n").slice(1, 4).join("\n")}` : ""}` : String(err);
    console.error("[recall]", message);
    const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
    if (isTauri) {
      import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke("debug_log", { msg: `[error] ${message}` }).catch(() => {}))
        .catch(() => {});
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#140a0a",
            color: "#ff8f8f",
            fontFamily: "ui-monospace, monospace",
            fontSize: 13,
            padding: 40,
          }}
        >
          <div style={{ maxWidth: 640, lineHeight: 1.6 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Runtime error — UI paused</div>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{this.state.error.message}</div>
            {this.state.error.stack && <div style={{ opacity: 0.6, marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{this.state.error.stack}</div>}
            <button
              onClick={() => this.setState({ error: null })}
              style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, background: "#ff8f8f", color: "#140a0a", fontWeight: 700, border: "none", cursor: "pointer" }}
            >
              Dismiss and retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}