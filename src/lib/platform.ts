export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

export async function invokeTauri<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) throw new Error(`"${cmd}" is only available in the desktop app`);
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export async function openExternal(url: string): Promise<void> {
  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function onTauriEvent(event: string, handler: () => void): Promise<() => void> {
  if (!isTauriRuntime()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen(event, () => handler());
}

export function deviceName(): string {
  if (isTauriRuntime()) return "Desktop app";
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { userAgentData?: { platform?: string } }) : undefined;
  const platform = nav?.userAgentData?.platform || nav?.platform || "browser";
  return `Web · ${platform}`;
}
