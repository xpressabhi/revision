import type { SyncCard, SyncFile, SyncReview } from "./types";
import { DEFAULT_DIFFICULTY, DEFAULT_EASE, DEFAULT_STABILITY } from "./fsrs";
import { getDeviceId, newUid } from "./ids";
import { deviceName } from "./platform";

export type SyncSnapshot = { cards: SyncCard[]; reviews: SyncReview[] };

export type MergeStats = {
  added: number;
  updated: number;
  deleted: number;
  restored: number;
  reviewsAdded: number;
  conflicts: number;
};

export function makeSyncFile(snapshot: SyncSnapshot, kind: SyncFile["kind"] = "revision-sync"): SyncFile {
  return {
    kind,
    version: 2,
    exported_at: new Date().toISOString(),
    device_id: getDeviceId(),
    device_name: deviceName(),
    cards: [...snapshot.cards].sort((a, b) => a.uid.localeCompare(b.uid)),
    reviews: [...snapshot.reviews].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

function sameCard(a: SyncCard, b: SyncCard): boolean {
  return (
    a.front === b.front &&
    a.back === b.back &&
    a.tags === b.tags &&
    a.deleted_at === b.deleted_at &&
    a.due_at === b.due_at &&
    a.interval === b.interval &&
    a.ease === b.ease &&
    a.reps === b.reps &&
    a.state === b.state &&
    a.stability === b.stability &&
    a.difficulty === b.difficulty
  );
}

function mergeCard(l: SyncCard, r: SyncCard, stats: MergeStats): SyncCard {
  let deletedAt: string | null = null;
  if (l.deleted_at || r.deleted_at) {
    const latestDeletion = [l.deleted_at, r.deleted_at].filter((d): d is string => d !== null).sort().pop() ?? null;
    deletedAt = latestDeletion;
    const live = l.deleted_at ? (r.deleted_at ? null : r) : l;
    if (live && latestDeletion && live.updated_at > latestDeletion) deletedAt = null;
  }

  const content = l.updated_at >= r.updated_at ? l : r;
  const state = l.state_updated_at >= r.state_updated_at ? l : r;
  const merged: SyncCard = {
    ...content,
    due_at: state.due_at,
    interval: state.interval,
    ease: state.ease,
    reps: state.reps,
    state: state.state,
    stability: state.stability,
    difficulty: state.difficulty,
    state_updated_at: state.state_updated_at,
    deleted_at: deletedAt,
  };

  if (!sameCard(l, merged)) {
    if (deletedAt && !l.deleted_at) stats.deleted++;
    else if (!deletedAt && l.deleted_at) stats.restored++;
    else stats.updated++;
  }
  if ((l.front !== r.front || l.back !== r.back || l.tags !== r.tags) && l.updated_at > l.created_at && r.updated_at > r.created_at) {
    stats.conflicts++;
  }
  return merged;
}

/**
 * Two-way merge of a local and a remote snapshot.
 * - cards are matched by uid; content and scheduling state resolve independently
 *   (last write wins, newest timestamp first)
 * - a deletion (tombstone) wins unless the other side edited the card afterwards
 * - reviews are an append-only union, deduplicated by uid
 */
export function mergeSync(local: SyncFile, remote: SyncFile): { merged: SyncFile; stats: MergeStats } {
  const stats: MergeStats = { added: 0, updated: 0, deleted: 0, restored: 0, reviewsAdded: 0, conflicts: 0 };
  const localCards = new Map(local.cards.map((c) => [c.uid, c]));
  const remoteCards = new Map(remote.cards.map((c) => [c.uid, c]));
  const uids = new Set([...localCards.keys(), ...remoteCards.keys()]);
  const mergedCards: SyncCard[] = [];

  for (const uid of uids) {
    const l = localCards.get(uid);
    const r = remoteCards.get(uid);
    if (l && !r) mergedCards.push(l);
    else if (!l && r) {
      mergedCards.push(r);
      stats.added++;
    } else if (l && r) mergedCards.push(mergeCard(l, r, stats));
  }
  mergedCards.sort((a, b) => a.uid.localeCompare(b.uid));

  const cardByUid = new Map(mergedCards.map((c) => [c.uid, c]));
  const localReviews = new Map(local.reviews.map((r) => [r.uid, r]));
  const mergedReviews: SyncReview[] = [];
  for (const r of localReviews.values()) {
    const card = cardByUid.get(r.card_uid);
    if (card && !card.deleted_at) mergedReviews.push(r);
  }
  for (const r of remote.reviews) {
    if (localReviews.has(r.uid)) continue;
    const card = cardByUid.get(r.card_uid);
    if (!card || card.deleted_at) continue;
    mergedReviews.push(r);
    stats.reviewsAdded++;
  }
  mergedReviews.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const merged: SyncFile = {
    kind: local.kind,
    version: 2,
    exported_at: new Date().toISOString(),
    device_id: local.device_id || remote.device_id,
    device_name: local.device_name || remote.device_name,
    cards: mergedCards,
    reviews: mergedReviews,
  };
  return { merged, stats };
}

export function describeStats(s: MergeStats): string {
  const parts: string[] = [];
  if (s.added) parts.push(`${s.added} added`);
  if (s.updated) parts.push(`${s.updated} updated`);
  if (s.deleted) parts.push(`${s.deleted} deleted`);
  if (s.restored) parts.push(`${s.restored} restored`);
  if (s.reviewsAdded) parts.push(`${s.reviewsAdded} reviews merged`);
  if (s.conflicts) parts.push(`${s.conflicts} conflicts resolved (newest wins)`);
  return parts.length ? parts.join(", ") : "already in sync";
}

type RawCard = Partial<SyncCard> & { id?: number };
type RawReview = Partial<SyncReview> & { card_id?: number };

/** Accepts current (v2) files and legacy v1 backups, always returns a v2 shape. */
export function parseSyncFile(text: string): SyncFile {
  const raw = JSON.parse(text) as { cards?: unknown; reviews?: unknown; kind?: unknown; exported_at?: unknown; device_id?: unknown; device_name?: unknown };
  if (!raw || !Array.isArray(raw.cards) || !Array.isArray(raw.reviews)) {
    throw new Error("Not a Revision backup or sync file");
  }
  const idToUid = new Map<number, string>();
  const now = new Date().toISOString();
  const cards: SyncCard[] = (raw.cards as RawCard[]).map((c) => {
    const uid = typeof c.uid === "string" && c.uid ? c.uid : newUid();
    if (typeof c.id === "number") idToUid.set(c.id, uid);
    const updated = c.updated_at ?? c.created_at ?? now;
    return {
      uid,
      front: String(c.front ?? ""),
      back: String(c.back ?? ""),
      tags: String(c.tags ?? ""),
      created_at: c.created_at ?? now,
      updated_at: updated,
      deleted_at: typeof c.deleted_at === "string" ? c.deleted_at : null,
      due_at: c.due_at ?? updated,
      interval: Number.isFinite(c.interval) ? Number(c.interval) : 0,
      ease: Number.isFinite(c.ease) ? Number(c.ease) : DEFAULT_EASE,
      reps: c.reps ?? 0,
      state: c.state === "learning" || c.state === "review" ? c.state : "new",
      stability: Number.isFinite(c.stability) ? Number(c.stability) : DEFAULT_STABILITY,
      difficulty: Number.isFinite(c.difficulty) ? Number(c.difficulty) : DEFAULT_DIFFICULTY,
      state_updated_at: c.state_updated_at ?? updated,
    };
  });
  const reviews: SyncReview[] = [];
  for (const r of raw.reviews as RawReview[]) {
    const cardUid = typeof r.card_uid === "string" && r.card_uid ? r.card_uid : typeof r.card_id === "number" ? idToUid.get(r.card_id) : undefined;
    if (!cardUid) continue;
    reviews.push({
      uid: typeof r.uid === "string" && r.uid ? r.uid : newUid(),
      card_uid: cardUid,
      grade: Number.isFinite(r.grade) ? Number(r.grade) : 3,
      created_at: r.created_at ?? now,
    });
  }
  return {
    kind: raw.kind === "revision-sync" ? "revision-sync" : "revision-backup",
    version: 2,
    exported_at: typeof raw.exported_at === "string" ? raw.exported_at : now,
    device_id: typeof raw.device_id === "string" ? raw.device_id : "unknown",
    device_name: typeof raw.device_name === "string" ? raw.device_name : "unknown",
    cards,
    reviews,
  };
}
