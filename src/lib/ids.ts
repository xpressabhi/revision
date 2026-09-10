export function newUid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

const LS_DEVICE_ID = "recall_device_id";

export function getDeviceId(): string {
  if (typeof localStorage === "undefined") return newUid();
  let id = localStorage.getItem(LS_DEVICE_ID);
  if (!id) {
    id = newUid();
    localStorage.setItem(LS_DEVICE_ID, id);
  }
  return id;
}
