export type StaleThreshold = 0 | 1 | 3 | 5 | 10;

export const STALE_DEFAULT: StaleThreshold = 3;
export const AUTO_END_DEFAULT_MIN = 15;
export const SWEEP_MS = 5000;

export const STALE_OPTIONS: { value: StaleThreshold; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 1, label: "1m" },
  { value: 3, label: "3m" },
  { value: 5, label: "5m" },
  { value: 10, label: "10m" },
];

export function isStale(lastTouchMs: number, now: number, thresholdMin: StaleThreshold): boolean {
  return thresholdMin > 0 && now - lastTouchMs >= thresholdMin * 60_000;
}

export function isAutoEnd(lastTouchMs: number, now: number, autoEndMin: number): boolean {
  return now - lastTouchMs >= autoEndMin * 60_000;
}