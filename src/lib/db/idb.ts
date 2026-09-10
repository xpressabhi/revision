import Dexie, { type EntityTable } from "dexie";
import type { Card, CardState, CardWithState, Deck, DeckStats, ImportCardRow, ReviewRow, SyncCard, SyncFile, SyncReview } from "../types";
import { DEFAULT_DIFFICULTY, DEFAULT_EASE, DEFAULT_STABILITY } from "../fsrs";
import { newUid } from "../ids";

type CardEntity = EntityTable<Card, "id">;
type ReviewEntity = EntityTable<ReviewRow, "id">;
type DeckEntity = EntityTable<Deck, "id">;

class RevisionDb extends Dexie {
  decks!: DeckEntity;
  cards!: CardEntity;
  states!: Dexie.Table<CardState, number>;
  reviews!: ReviewEntity;
  constructor() {
    super("revision");
    this.version(1).stores({
      decks: "++id, &name",
      cards: "++id, &uid, deck_id, updated_at, deleted_at",
      states: "card_id, due_at, state",
      reviews: "++id, &uid, card_id, created_at",
    });
  }
}

export const dex = new RevisionDb();

// ── cross-tab refresh ──────────────────────────────────────────────
function makeChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("revision-db") : null;
  } catch {
    return null;
  }
}
const channel = makeChannel();
const externalListeners = new Set<() => void>();
channel?.addEventListener("message", () => {
  for (const cb of externalListeners) cb();
});
function notify() {
  channel?.postMessage("changed");
}
export function onExternalChange(cb: () => void): () => void {
  externalListeners.add(cb);
  return () => externalListeners.delete(cb);
}

// ── helpers ────────────────────────────────────────────────────────
function nowIso() {
  return new Date().toISOString();
}

const LS_KEYS = ["revision_decks", "revision_cards", "revision_states", "revision_reviews", "revision_seq"] as const;

function loadLegacy<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function deckNameToTag(name: string): string {
  const map: Record<string, string> = {
    "DSA / LeetCode": "dsa",
    "System Design Concepts": "sd-concepts",
    "System Design Use Cases": "sd-use-cases",
    "AI Concepts": "ai-concepts",
    "AI Use Cases": "ai-use-cases",
    Behavioral: "behavioral",
    Revision: "revision",
  };
  if (map[name]) return map[name];
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function defaultState(cardId: number, at: string): CardState {
  return {
    card_id: cardId,
    due_at: at,
    interval: 0,
    ease: DEFAULT_EASE,
    reps: 0,
    state: "new",
    stability: DEFAULT_STABILITY,
    difficulty: DEFAULT_DIFFICULTY,
    updated_at: at,
  };
}

// ── init ───────────────────────────────────────────────────────────
let initPromise: Promise<void> | null = null;

export function initDb(): Promise<void> {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

/** One-time import of the old localStorage store (pre-IndexedDB browser builds). */
async function migrateLegacyLocalStorage() {
  const legacyCards = loadLegacy<unknown[]>("revision_cards", []);
  if (legacyCards.length === 0) return;
  if ((await dex.cards.count()) > 0) {
    for (const key of LS_KEYS) localStorage.removeItem(key);
    return;
  }

  const legacyDecks = loadLegacy<Deck[]>("revision_decks", []);
  const legacyStates = loadLegacy<(CardState & { stability?: number; difficulty?: number })[]>("revision_states", []);
  const legacyReviews = loadLegacy<{ id: number; card_id: number; grade: number; created_at: string; uid?: string }[]>("revision_reviews", []);

  const cards: Card[] = legacyCards.map((c) => {
    const row = c as Partial<Card>;
    return {
      id: Number(row.id ?? 0),
      uid: row.uid ?? newUid(),
      deck_id: Number(row.deck_id ?? 1),
      front: String(row.front ?? ""),
      back: String(row.back ?? ""),
      tags: String(row.tags ?? ""),
      created_at: row.created_at ?? nowIso(),
      updated_at: row.updated_at ?? nowIso(),
      deleted_at: row.deleted_at ?? null,
    };
  });
  const states: CardState[] = legacyStates.map((s) => ({
    card_id: s.card_id,
    due_at: s.due_at ?? nowIso(),
    interval: Number(s.interval ?? 0),
    ease: Number(s.ease ?? DEFAULT_EASE),
    reps: Number(s.reps ?? 0),
    state: s.state ?? "new",
    stability: Number(s.stability ?? DEFAULT_STABILITY),
    difficulty: Number(s.difficulty ?? DEFAULT_DIFFICULTY),
    updated_at: s.updated_at ?? nowIso(),
  }));
  const reviews: ReviewRow[] = legacyReviews.map((r) => ({
    id: Number(r.id ?? 0),
    uid: r.uid ?? newUid(),
    card_id: r.card_id,
    grade: Number(r.grade ?? 3),
    created_at: r.created_at ?? nowIso(),
  }));

  await dex.transaction("rw", dex.decks, dex.cards, dex.states, dex.reviews, async () => {
    if (legacyDecks.length) await dex.decks.bulkPut(legacyDecks);
    if (cards.length) await dex.cards.bulkPut(cards);
    if (states.length) await dex.states.bulkPut(states);
    if (reviews.length) await dex.reviews.bulkPut(reviews);
  });
  for (const key of LS_KEYS) localStorage.removeItem(key);
}

async function migrateToSingleDeck() {
  const decks = await dex.decks.toArray();
  const SINGLE = "Revision";
  let revision = decks.find((d) => d.name === SINGLE);
  if (!revision) {
    const id = await dex.decks.add({ name: SINGLE, created_at: nowIso() });
    revision = { id: id as number, name: SINGLE, created_at: nowIso() };
  }
  const oldDecks = decks.filter((d) => d.id !== revision!.id);
  if (oldDecks.length === 0) return;
  const deckMap = new Map(oldDecks.map((d) => [d.id, d.name] as const));
  const now = nowIso();
  await dex.transaction("rw", dex.cards, dex.decks, async () => {
    for (const card of await dex.cards.toArray()) {
      const oldName = deckMap.get(card.deck_id);
      if (!oldName) continue;
      const tag = deckNameToTag(oldName);
      const tags = card.tags || "";
      const hasTag = tags.split(",").map((t) => t.trim().toLowerCase()).includes(tag);
      await dex.cards.update(card.id, {
        deck_id: revision!.id,
        tags: hasTag ? tags : tags ? `${tags}, ${tag}` : tag,
        updated_at: now,
      });
    }
    await dex.decks.bulkDelete(oldDecks.map((d) => d.id));
  });
}

async function doInit() {
  await migrateLegacyLocalStorage();

  let decks = await dex.decks.toArray();
  if (decks.length === 0) {
    await dex.decks.add({ name: "Revision", created_at: nowIso() });
  } else if (decks.length > 1 || !decks.some((d) => d.name === "Revision")) {
    await migrateToSingleDeck();
  }

  const cards = await dex.cards.toArray();
  const states = await dex.states.toArray();
  const stateIds = new Set(states.map((s) => s.card_id));
  const missing = cards.filter((c) => !stateIds.has(c.id));
  if (missing.length) {
    await dex.states.bulkPut(missing.map((c) => defaultState(c.id, c.updated_at)));
  }

  const patched: CardState[] = [];
  for (const s of states as (CardState & { stability?: number; difficulty?: number })[]) {
    const next = { ...s } as CardState;
    let changed = false;
    if (typeof next.stability !== "number") {
      next.stability = DEFAULT_STABILITY;
      changed = true;
    }
    if (typeof next.difficulty !== "number") {
      next.difficulty = DEFAULT_DIFFICULTY;
      changed = true;
    }
    if (next.stability <= 0 && next.state === "review" && (next.interval ?? 0) > 0) {
      next.stability = Math.max(1, next.interval);
      changed = true;
    }
    if (changed) patched.push(next);
  }
  if (patched.length) await dex.states.bulkPut(patched);
}

// ── decks / cards ──────────────────────────────────────────────────
export async function getDecks(): Promise<Deck[]> {
  await initDb();
  return dex.decks.orderBy("id").toArray();
}

export async function createCard(deckId: number, front: string, back: string, tags: string): Promise<number> {
  const now = nowIso();
  return dex.transaction("rw", dex.cards, dex.states, async () => {
    const id = (await dex.cards.add({
      uid: newUid(),
      deck_id: deckId,
      front: front.trim(),
      back: back.trim(),
      tags: tags.trim(),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    })) as number;
    await dex.states.add(defaultState(id, now));
    return id;
  });
}

export async function updateCard(id: number, deckId: number, front: string, back: string, tags: string): Promise<void> {
  await dex.cards.update(id, { deck_id: deckId, front: front.trim(), back: back.trim(), tags: tags.trim(), updated_at: nowIso() });
  notify();
}

export async function deleteCard(id: number): Promise<void> {
  const now = nowIso();
  await dex.transaction("rw", dex.cards, dex.states, dex.reviews, async () => {
    await dex.cards.update(id, { deleted_at: now, updated_at: now });
    await dex.states.delete(id);
    await dex.reviews.where("card_id").equals(id).delete();
  });
  notify();
}

export async function getAllCardsWithState(opts?: { deckId?: number | null; search?: string; state?: string | null }): Promise<CardWithState[]> {
  await initDb();
  const [decks, cards, states] = await Promise.all([dex.decks.toArray(), dex.cards.toArray(), dex.states.toArray()]);
  const deckMap = new Map(decks.map((d) => [d.id, d.name]));
  const stateMap = new Map(states.map((s) => [s.card_id, s]));
  let rows: CardWithState[] = cards
    .filter((c) => c.deleted_at === null)
    .map((c) => {
      const s = stateMap.get(c.id) ?? defaultState(c.id, c.updated_at);
      return {
        ...c,
        deck_name: deckMap.get(c.deck_id) ?? "",
        state: s.state,
        due_at: s.due_at,
        interval: s.interval,
        ease: s.ease,
        reps: s.reps,
        stability: s.stability,
        difficulty: s.difficulty,
      };
    });

  if (opts?.deckId) rows = rows.filter((c) => c.deck_id === opts.deckId);
  if (opts?.state) rows = rows.filter((c) => c.state === opts.state);
  if (opts?.search && opts.search.trim()) {
    const q = opts.search.trim().toLowerCase();
    rows = rows.filter(
      (c) =>
        c.front.toLowerCase().includes(q) ||
        c.back.toLowerCase().includes(q) ||
        c.tags.toLowerCase().includes(q) ||
        (c.deck_name ?? "").toLowerCase().includes(q)
    );
  }
  rows.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  return rows;
}

export async function getDeckStats(): Promise<DeckStats[]> {
  const decks = await getDecks();
  const cards = await getAllCardsWithState();
  const now = Date.now();
  return decks.map((d) => {
    const forDeck = cards.filter((c) => c.deck_id === d.id);
    return {
      deck_id: d.id,
      deck_name: d.name,
      total: forDeck.length,
      due: forDeck.filter((c) => c.state !== "new" && new Date(c.due_at).getTime() <= now).length,
      newCount: forDeck.filter((c) => c.state === "new").length,
      learning: forDeck.filter((c) => c.state === "learning").length,
      review: forDeck.filter((c) => c.state === "review").length,
    };
  });
}

export async function updateCardState(state: CardState): Promise<void> {
  await dex.states.put(state);
  notify();
}

export async function logReviewAt(cardId: number, grade: number, when: Date): Promise<void> {
  await dex.reviews.add({ uid: newUid(), card_id: cardId, grade, created_at: when.toISOString() });
  notify();
}

export async function logReview(cardId: number, grade: number): Promise<void> {
  return logReviewAt(cardId, grade, new Date());
}

export async function getReviews(): Promise<ReviewRow[]> {
  await initDb();
  const reviews = await dex.reviews.toArray();
  return reviews.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function deleteLastReview(cardId: number): Promise<void> {
  const reviews = await dex.reviews.where("card_id").equals(cardId).toArray();
  if (!reviews.length) return;
  const last = reviews.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
  await dex.reviews.delete(last.id);
  notify();
}

export async function bulkCreateCards(rows: { deckName: string; front: string; back: string; tags: string }[]): Promise<number> {
  const decks = await getDecks();
  const map = new Map(decks.map((d) => [d.name.toLowerCase(), d.id]));
  const singleId = decks.length === 1 ? decks[0].id : null;
  let created = 0;
  for (const r of rows) {
    let deckId = map.get(r.deckName.toLowerCase());
    let extraTag: string | null = null;
    if (!deckId && singleId) {
      deckId = singleId;
      extraTag = deckNameToTag(r.deckName);
    }
    if (!deckId || !r.front.trim() || !r.back.trim()) continue;
    let tags = r.tags || "";
    if (extraTag) {
      const has = tags.split(",").map((t) => t.trim().toLowerCase()).includes(extraTag);
      if (!has) tags = tags ? `${tags}, ${extraTag}` : extraTag;
    }
    await createCard(deckId, r.front, r.back, tags);
    created++;
  }
  return created;
}

export async function importCards(deckId: number, rows: ImportCardRow[]): Promise<number> {
  const now = nowIso();
  await dex.transaction("rw", dex.cards, dex.states, async () => {
    for (const r of rows) {
      const id = (await dex.cards.add({
        uid: newUid(),
        deck_id: deckId,
        front: r.front.trim(),
        back: r.back.trim(),
        tags: r.tags.trim(),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })) as number;
      await dex.states.add({
        card_id: id,
        due_at: r.due_at,
        interval: r.interval,
        ease: DEFAULT_EASE,
        reps: r.reps,
        state: r.state,
        stability: r.stability,
        difficulty: r.difficulty,
        updated_at: now,
      });
    }
  });
  notify();
  return rows.length;
}

// ── snapshots / sync ───────────────────────────────────────────────
export async function getSyncSnapshot(): Promise<{ cards: SyncCard[]; reviews: SyncReview[] }> {
  await initDb();
  const [cards, states, reviews] = await Promise.all([dex.cards.toArray(), dex.states.toArray(), dex.reviews.toArray()]);
  const stateMap = new Map(states.map((s) => [s.card_id, s]));
  const cardsOut: SyncCard[] = cards.map((c) => {
    const s = stateMap.get(c.id);
    return {
      uid: c.uid,
      front: c.front,
      back: c.back,
      tags: c.tags,
      created_at: c.created_at,
      updated_at: c.updated_at,
      deleted_at: c.deleted_at,
      due_at: s?.due_at ?? c.updated_at,
      interval: s?.interval ?? 0,
      ease: s?.ease ?? DEFAULT_EASE,
      reps: s?.reps ?? 0,
      state: s?.state ?? "new",
      stability: s?.stability ?? DEFAULT_STABILITY,
      difficulty: s?.difficulty ?? DEFAULT_DIFFICULTY,
      state_updated_at: s?.updated_at ?? c.updated_at,
    };
  });
  const uidById = new Map(cards.map((c) => [c.id, c.uid]));
  const reviewsOut: SyncReview[] = [];
  for (const r of reviews) {
    const cardUid = uidById.get(r.card_id);
    if (!cardUid) continue;
    reviewsOut.push({ uid: r.uid, card_uid: cardUid, grade: r.grade, created_at: r.created_at });
  }
  return { cards: cardsOut, reviews: reviewsOut };
}

export async function applySyncSnapshot(file: { cards: SyncCard[]; reviews: SyncReview[] }): Promise<void> {
  await initDb();
  const deck = await dex.decks.orderBy("id").first();
  const deckId = deck?.id ?? 1;
  const oldCards = await dex.cards.toArray();
  const oldReviews = await dex.reviews.toArray();
  const idByUid = new Map(oldCards.map((c) => [c.uid, c.id]));
  const reviewIdByUid = new Map(oldReviews.map((r) => [r.uid, r.id]));
  let nextCardId = oldCards.reduce((m, c) => Math.max(m, c.id), 0) + 1;
  let nextReviewId = oldReviews.reduce((m, r) => Math.max(m, r.id), 0) + 1;

  const uidToId = new Map<string, number>();
  const cardRows: Card[] = file.cards.map((c) => {
    const id = idByUid.get(c.uid) ?? nextCardId++;
    uidToId.set(c.uid, id);
    return {
      id,
      uid: c.uid,
      deck_id: deckId,
      front: c.front,
      back: c.back,
      tags: c.tags,
      created_at: c.created_at,
      updated_at: c.updated_at,
      deleted_at: c.deleted_at,
    };
  });
  const stateRows: CardState[] = file.cards
    .filter((c) => !c.deleted_at)
    .map((c) => ({
      card_id: uidToId.get(c.uid)!,
      due_at: c.due_at,
      interval: c.interval,
      ease: c.ease,
      reps: c.reps,
      state: c.state,
      stability: c.stability,
      difficulty: c.difficulty,
      updated_at: c.state_updated_at,
    }));
  const deletedUids = new Set(file.cards.filter((c) => c.deleted_at).map((c) => c.uid));
  const reviewRows: ReviewRow[] = file.reviews
    .filter((r) => !deletedUids.has(r.card_uid))
    .map((r) => ({
      id: reviewIdByUid.get(r.uid) ?? nextReviewId++,
      uid: r.uid,
      card_id: uidToId.get(r.card_uid)!,
      grade: r.grade,
      created_at: r.created_at,
    }));

  await dex.transaction("rw", dex.cards, dex.states, dex.reviews, async () => {
    await dex.reviews.clear();
    await dex.states.clear();
    await dex.cards.clear();
    if (cardRows.length) await dex.cards.bulkAdd(cardRows);
    if (stateRows.length) await dex.states.bulkAdd(stateRows);
    if (reviewRows.length) await dex.reviews.bulkAdd(reviewRows);
  });
  notify();
}

export async function restoreBackup(backup: Pick<SyncFile, "cards" | "reviews">): Promise<void> {
  return applySyncSnapshot(backup);
}

export async function clearAllCards(): Promise<void> {
  const now = nowIso();
  await dex.transaction("rw", dex.cards, dex.states, dex.reviews, async () => {
    const cards = await dex.cards.toArray();
    await dex.cards.bulkPut(cards.map((c) => (c.deleted_at ? c : { ...c, deleted_at: now, updated_at: now })));
    await dex.states.clear();
    await dex.reviews.clear();
  });
  notify();
}

export async function deduplicateCards(): Promise<number> {
  const cards = await dex.cards.toArray();
  const seen = new Map<string, number>();
  const toDelete: number[] = [];
  for (const c of cards) {
    if (c.deleted_at) continue;
    const key = `${c.deck_id}::${c.front.trim()}`;
    if (!seen.has(key)) seen.set(key, c.id);
    else toDelete.push(c.id);
  }
  for (const id of toDelete) await deleteCard(id);
  return toDelete.length;
}
