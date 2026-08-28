// Simple in-memory/localStorage fallback for browser preview (npm run dev without Tauri)
// Mirrors the SQLite schema but uses JSON in localStorage

import type { CardState, CardWithState, Deck, DeckStats } from "./types";
import { DEFAULT_EASE } from "./srs";

const LS_DECKS = "revision_decks";
const LS_CARDS = "revision_cards";
const LS_STATES = "revision_states";
const LS_REVIEWS = "revision_reviews";
const LS_SEQ = "revision_seq";

type ReviewRow = { id: number; card_id: number; grade: number; created_at: string };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  localStorage.setItem(key, JSON.stringify(v));
}
function nextId(key: string): number {
  const seq = load<Record<string, number>>(LS_SEQ, {});
  const n = (seq[key] ?? 0) + 1;
  seq[key] = n;
  save(LS_SEQ, seq);
  // ensure at least max existing +1 for migration
  return n;
}
function ensureSeq(key: string, v: number) {
  const seq = load<Record<string, number>>(LS_SEQ, {});
  if ((seq[key] ?? 0) < v) {
    seq[key] = v;
    save(LS_SEQ, seq);
  }
}

function nowIso() {
  return new Date().toISOString();
}

export async function browserInitDb() {
  let decks = load<Deck[]>(LS_DECKS, []);
  let cards = load<CardWithState[]>(LS_CARDS, []); // we store CardWithState-like but separate
  let states = load<CardState[]>(LS_STATES, []);
  let reviews = load<ReviewRow[]>(LS_REVIEWS, []);

  // Seed decks if empty
  if (decks.length === 0) {
    const now = nowIso();
    const names = [
      "DSA / LeetCode",
      "System Design Concepts",
      "System Design Use Cases",
      "AI Concepts",
      "AI Use Cases",
      "Behavioral",
    ];
    decks = names.map((name, i) => ({ id: i + 1, name, created_at: now }));
    save(LS_DECKS, decks);
    save(LS_SEQ, { decks: names.length, cards: 0, reviews: 0, states: 0 });
  }
  // Ensure seq
  if (decks.length) {
    ensureSeq("decks", Math.max(...decks.map((d) => d.id)));
  }
  if (cards.length) {
    ensureSeq("cards", Math.max(...(cards as unknown as { id: number }[]).map((c) => c.id)));
  }
  // Backfill states for cards missing
  const existingIds = new Set(states.map((s) => s.card_id));
  let added = false;
  for (const c of cards as unknown as { id: number; updated_at: string }[]) {
    if (!existingIds.has(c.id)) {
      states.push({
        card_id: c.id,
        due_at: (c as unknown as { updated_at: string }).updated_at,
        interval: 0,
        ease: DEFAULT_EASE,
        reps: 0,
        state: "new",
        updated_at: nowIso(),
      });
      added = true;
    }
  }
  if (added) save(LS_STATES, states);
  // Ensure arrays exist
  save(LS_CARDS, cards);
  save(LS_STATES, states);
  save(LS_REVIEWS, reviews);
}

export async function browserGetDecks(): Promise<Deck[]> {
  await browserInitDb();
  return load<Deck[]>(LS_DECKS, []);
}

export async function browserCreateDeck(name: string) {
  const decks = load<Deck[]>(LS_DECKS, []);
  const id = nextId("decks");
  decks.push({ id, name: name.trim(), created_at: nowIso() });
  save(LS_DECKS, decks);
}

export async function browserDeleteDeck(id: number) {
  let decks = load<Deck[]>(LS_DECKS, []);
  let cards = load<any[]>(LS_CARDS, []);
  let states = load<CardState[]>(LS_STATES, []);
  decks = decks.filter((d) => d.id !== id);
  const cardIds = new Set(cards.filter((c) => c.deck_id === id).map((c) => c.id));
  cards = cards.filter((c) => c.deck_id !== id);
  states = states.filter((s) => !cardIds.has(s.card_id));
  save(LS_DECKS, decks);
  save(LS_CARDS, cards);
  save(LS_STATES, states);
}

export async function browserCreateCard(deckId: number, front: string, back: string, tags: string): Promise<number> {
  const cards = load<any[]>(LS_CARDS, []);
  const states = load<CardState[]>(LS_STATES, []);
  const id = nextId("cards");
  const now = nowIso();
  cards.push({ id, deck_id: deckId, front: front.trim(), back: back.trim(), tags: tags.trim(), created_at: now, updated_at: now });
  states.push({ card_id: id, due_at: now, interval: 0, ease: DEFAULT_EASE, reps: 0, state: "new", updated_at: now });
  save(LS_CARDS, cards);
  save(LS_STATES, states);
  return id;
}

export async function browserUpdateCard(id: number, deckId: number, front: string, back: string, tags: string) {
  const cards = load<any[]>(LS_CARDS, []);
  const idx = cards.findIndex((c) => c.id === id);
  if (idx >= 0) {
    cards[idx] = { ...cards[idx], deck_id: deckId, front: front.trim(), back: back.trim(), tags: tags.trim(), updated_at: nowIso() };
    save(LS_CARDS, cards);
  }
}

export async function browserDeleteCard(id: number) {
  let cards = load<any[]>(LS_CARDS, []);
  let states = load<CardState[]>(LS_STATES, []);
  cards = cards.filter((c) => c.id !== id);
  states = states.filter((s) => s.card_id !== id);
  save(LS_CARDS, cards);
  save(LS_STATES, states);
}

export async function browserGetAllCardsWithState(opts?: { deckId?: number | null; search?: string; state?: string | null }): Promise<CardWithState[]> {
  const decks = load<Deck[]>(LS_DECKS, []);
  const cards = load<any[]>(LS_CARDS, []);
  const states = load<CardState[]>(LS_STATES, []);
  const deckMap = new Map(decks.map((d) => [d.id, d.name]));
  const stateMap = new Map(states.map((s) => [s.card_id, s]));
  let rows: CardWithState[] = cards
    .map((c) => {
      const s = stateMap.get(c.id);
      if (!s) return null;
      return { ...c, deck_name: deckMap.get(c.deck_id) ?? "", state: s.state, due_at: s.due_at, interval: s.interval, ease: s.ease, reps: s.reps } as CardWithState;
    })
    .filter(Boolean) as CardWithState[];

  if (opts?.deckId) rows = rows.filter((c) => c.deck_id === opts.deckId);
  if (opts?.state) rows = rows.filter((c) => c.state === opts.state);
  if (opts?.search && opts.search.trim()) {
    const q = opts.search.trim().toLowerCase();
    rows = rows.filter((c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || c.tags.toLowerCase().includes(q) || (c.deck_name ?? "").toLowerCase().includes(q));
  }
  rows.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  return rows;
}

export async function browserGetDueCards(limitNew = 20): Promise<CardWithState[]> {
  const all = await browserGetAllCardsWithState();
  const now = new Date();
  const due = all.filter((c) => c.state !== "new" && new Date(c.due_at).getTime() <= now.getTime()).slice(0, 200);
  const fresh = all.filter((c) => c.state === "new").slice(0, limitNew);
  return [...due, ...fresh];
}

export async function browserGetDeckStats(): Promise<DeckStats[]> {
  const decks = load<Deck[]>(LS_DECKS, []);
  const cards = await browserGetAllCardsWithState();
  const now = new Date();
  return decks.map((d) => {
    const forDeck = cards.filter((c) => c.deck_id === d.id);
    return {
      deck_id: d.id,
      deck_name: d.name,
      total: forDeck.length,
      due: forDeck.filter((c) => c.state !== "new" && new Date(c.due_at).getTime() <= now.getTime()).length,
      newCount: forDeck.filter((c) => c.state === "new").length,
      learning: forDeck.filter((c) => c.state === "learning").length,
      review: forDeck.filter((c) => c.state === "review").length,
    };
  });
}

export async function browserUpdateCardState(state: CardState) {
  const states = load<CardState[]>(LS_STATES, []);
  const idx = states.findIndex((s) => s.card_id === state.card_id);
  if (idx >= 0) states[idx] = state;
  else states.push(state);
  save(LS_STATES, states);
}

export async function browserLogReview(cardId: number, grade: number) {
  const reviews = load<ReviewRow[]>(LS_REVIEWS, []);
  const id = nextId("reviews");
  reviews.push({ id, card_id: cardId, grade, created_at: nowIso() });
  save(LS_REVIEWS, reviews);
}

export async function browserBulkCreateCards(rows: { deckName: string; front: string; back: string; tags: string }[]): Promise<number> {
  const decks = load<Deck[]>(LS_DECKS, []);
  const map = new Map(decks.map((d) => [d.name.toLowerCase(), d.id]));
  let created = 0;
  for (const r of rows) {
    const deckId = map.get(r.deckName.toLowerCase());
    if (!deckId) continue;
    if (!r.front.trim() || !r.back.trim()) continue;
    await browserCreateCard(deckId, r.front, r.back, r.tags);
    created++;
  }
  return created;
}

export async function browserClearAllCards() {
  save(LS_CARDS, []);
  save(LS_STATES, []);
  save(LS_REVIEWS, []);
  const seq = load<Record<string, number>>(LS_SEQ, {});
  save(LS_SEQ, { ...seq, cards: 0, reviews: 0 });
}

export async function browserDeduplicateCards(): Promise<number> {
  const cards = load<any[]>(LS_CARDS, []);
  const states = load<CardState[]>(LS_STATES, []);
  const reviews = load<ReviewRow[]>(LS_REVIEWS, []);
  const seen = new Map<string, number>();
  const toDelete: number[] = [];
  for (const c of cards) {
    const key = `${c.deck_id}::${c.front.trim()}`;
    if (!seen.has(key)) {
      seen.set(key, c.id);
    } else {
      toDelete.push(c.id);
    }
  }
  if (toDelete.length === 0) return 0;
  const delSet = new Set(toDelete);
  save(LS_CARDS, cards.filter((c: any) => !delSet.has(c.id)));
  save(LS_STATES, states.filter((s) => !delSet.has(s.card_id)));
  save(LS_REVIEWS, reviews.filter((r) => !delSet.has(r.card_id)));
  return toDelete.length;
}
