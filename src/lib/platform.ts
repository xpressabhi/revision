export function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "tiny" in window;
}

export async function desktopCall<T = void>(method: string, params?: Record<string, unknown>): Promise<T> {
  if (!isDesktopRuntime()) throw new Error(`"${method}" is only available in the desktop app`);
  return (await tiny.api.call(method, params)) as T;
}

export function onDesktopEvent(event: string, handler: () => void): () => void {
  if (!isDesktopRuntime()) return () => {};
  const off: unknown = tiny.api.on(event, () => handler());
  return typeof off === "function" ? (off as () => void) : () => {};
}

export async function openExternal(url: string): Promise<void> {
  if (isDesktopRuntime()) {
    await tiny.app.shell.open(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function deviceName(): string {
  if (isDesktopRuntime()) return "Desktop app";
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { userAgentData?: { platform?: string } }) : undefined;
  const platform = nav?.userAgentData?.platform || nav?.platform || "browser";
  return `Web · ${platform}`;
}
