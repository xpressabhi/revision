// @ts-nocheck
import type { CardState, CardWithState, Deck, DeckStats } from "./types";
import { DEFAULT_EASE } from "./srs";
import {
  browserInitDb,
  browserGetDecks,
  browserCreateDeck,
  browserDeleteDeck,
  browserCreateCard,
  browserUpdateCard,
  browserDeleteCard,
  browserGetAllCardsWithState,
  browserGetDueCards,
  browserGetDeckStats,
  browserUpdateCardState,
  browserLogReview,
  browserBulkCreateCards,
} from "./db.browser";

// Tauri detection
function isTauri(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

let dbInstance: any | null = null;

async function getDb() {
  if (dbInstance) return dbInstance;
  // Lazy import so browser bundle doesn't fail if plugin missing
  const mod = await import("@tauri-apps/plugin-sql");
  const Database = mod.default;
  dbInstance = await Database.load("sqlite:revision.db");
  return dbInstance;
}

// Initialize schema
export async function initDb() {
  if (!isTauri()) {
    return browserInitDb();
  }
  try {
    const db = await getDb();
    await db.execute("PRAGMA journal_mode=WAL;");
    await db.execute("PRAGMA foreign_keys=ON;");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS decks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS card_state (
        card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
        due_at TEXT NOT NULL,
        interval REAL NOT NULL DEFAULT 0,
        ease REAL NOT NULL DEFAULT ${DEFAULT_EASE},
        reps INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'new',
        updated_at TEXT NOT NULL
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        grade INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_state_due ON card_state(due_at);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_state_state ON card_state(state);`);

    const existing = await db.select<{ cnt: number }[]>("SELECT COUNT(*) as cnt FROM decks");
    if (existing[0].cnt === 0) {
      const now = new Date().toISOString();
      const defaultDecks = [
        "DSA / LeetCode",
        "System Design Concepts",
        "System Design Use Cases",
        "AI Concepts",
        "AI Use Cases",
        "Behavioral",
      ];
      for (const name of defaultDecks) {
        await db.execute("INSERT INTO decks (name, created_at) VALUES ($1, $2)", [name, now]);
      }
    }
    await db.execute(
      `INSERT OR IGNORE INTO card_state (card_id, due_at, interval, ease, reps, state, updated_at)
       SELECT id, updated_at, 0, ${DEFAULT_EASE}, 0, 'new', updated_at FROM cards
       WHERE id NOT IN (SELECT card_id FROM card_state)`
    );
  } catch (e) {
    console.warn("Tauri DB failed, falling back to browser storage", e);
    return browserInitDb();
  }
}

export async function getDecks(): Promise<Deck[]> {
  if (!isTauri()) return browserGetDecks();
  try {
    const db = await getDb();
    return db.select<Deck[]>("SELECT * FROM decks ORDER BY id ASC");
  } catch {
    return browserGetDecks();
  }
}

export async function createDeck(name: string): Promise<void> {
  if (!isTauri()) return browserCreateDeck(name);
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.execute("INSERT INTO decks (name, created_at) VALUES ($1, $2)", [name.trim(), now]);
  } catch {
    return browserCreateDeck(name);
  }
}

export async function deleteDeck(id: number): Promise<void> {
  if (!isTauri()) return browserDeleteDeck(id);
  try {
    const db = await getDb();
    await db.execute("DELETE FROM decks WHERE id=$1", [id]);
  } catch {
    return browserDeleteDeck(id);
  }
}

export async function createCard(
  deckId: number,
  front: string,
  back: string,
  tags: string
): Promise<number> {
  if (!isTauri()) return browserCreateCard(deckId, front, back, tags);
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    const res = await db.execute(
      "INSERT INTO cards (deck_id, front, back, tags, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [deckId, front.trim(), back.trim(), tags.trim(), now, now]
    );
    const cardId = (res as unknown as { lastInsertId: number }).lastInsertId;
    await db.execute(
      "INSERT INTO card_state (card_id, due_at, interval, ease, reps, state, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [cardId, now, 0, DEFAULT_EASE, 0, "new", now]
    );
    return cardId;
  } catch {
    return browserCreateCard(deckId, front, back, tags);
  }
}

export async function updateCard(
  id: number,
  deckId: number,
  front: string,
  back: string,
  tags: string
): Promise<void> {
  if (!isTauri()) return browserUpdateCard(id, deckId, front, back, tags);
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.execute(
      "UPDATE cards SET deck_id=$1, front=$2, back=$3, tags=$4, updated_at=$5 WHERE id=$6",
      [deckId, front.trim(), back.trim(), tags.trim(), now, id]
    );
  } catch {
    return browserUpdateCard(id, deckId, front, back, tags);
  }
}

export async function deleteCard(id: number): Promise<void> {
  if (!isTauri()) return browserDeleteCard(id);
  try {
    const db = await getDb();
    await db.execute("DELETE FROM cards WHERE id=$1", [id]);
  } catch {
    return browserDeleteCard(id);
  }
}

export async function getAllCardsWithState(opts?: {
  deckId?: number | null;
  search?: string;
  state?: string | null;
}): Promise<CardWithState[]> {
  if (!isTauri()) return browserGetAllCardsWithState(opts);
  try {
    const db = await getDb();
    let where: string[] = [];
    let params: unknown[] = [];
    let idx = 1;
    if (opts?.deckId) {
      where.push(`c.deck_id = $${idx++}`);
      params.push(opts.deckId);
    }
    if (opts?.state) {
      where.push(`cs.state = $${idx++}`);
      params.push(opts.state);
    }
    if (opts?.search && opts.search.trim()) {
      const term = `%${opts.search.trim().toLowerCase()}%`;
      where.push(`(LOWER(c.front) LIKE $${idx} OR LOWER(c.back) LIKE $${idx} OR LOWER(c.tags) LIKE $${idx} OR LOWER(d.name) LIKE $${idx})`);
      params.push(term);
      idx++;
    }
    const whereCl = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const sql = `
      SELECT c.*, d.name as deck_name, cs.state, cs.due_at, cs.interval, cs.ease, cs.reps
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      JOIN card_state cs ON cs.card_id = c.id
      ${whereCl}
      ORDER BY cs.due_at ASC, c.updated_at DESC
    `;
    return db.select<CardWithState[]>(sql, params as never);
  } catch {
    return browserGetAllCardsWithState(opts);
  }
}

export async function getDueCards(limitNew = 20): Promise<CardWithState[]> {
  if (!isTauri()) return browserGetDueCards(limitNew);
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    const due = await db.select<CardWithState[]>(
      `SELECT c.*, d.name as deck_name, cs.state, cs.due_at, cs.interval, cs.ease, cs.reps
       FROM cards c JOIN decks d ON d.id=c.deck_id JOIN card_state cs ON cs.card_id=c.id
       WHERE cs.due_at <= $1 AND cs.state != 'new'
       ORDER BY cs.due_at ASC LIMIT 200`,
      [now]
    );
    const newCards = await db.select<CardWithState[]>(
      `SELECT c.*, d.name as deck_name, cs.state, cs.due_at, cs.interval, cs.ease, cs.reps
       FROM cards c JOIN decks d ON d.id=c.deck_id JOIN card_state cs ON cs.card_id=c.id
       WHERE cs.state='new'
       ORDER BY c.created_at ASC LIMIT $1`,
      [limitNew]
    );
    return [...due, ...newCards];
  } catch {
    return browserGetDueCards(limitNew);
  }
}

export async function getDeckStats(): Promise<DeckStats[]> {
  if (!isTauri()) return browserGetDeckStats();
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    const rows = await db.select<
      { id: number; name: string; total: number; due: number; newCount: number; learning: number; review: number }[]
    >(
      `SELECT d.id, d.name,
         COUNT(c.id) as total,
         SUM(CASE WHEN cs.state != 'new' AND cs.due_at <= $1 THEN 1 ELSE 0 END) as due,
         SUM(CASE WHEN cs.state='new' THEN 1 ELSE 0 END) as newCount,
         SUM(CASE WHEN cs.state='learning' THEN 1 ELSE 0 END) as learning,
         SUM(CASE WHEN cs.state='review' THEN 1 ELSE 0 END) as review
       FROM decks d
       LEFT JOIN cards c ON c.deck_id=d.id
       LEFT JOIN card_state cs ON cs.card_id=c.id
       GROUP BY d.id, d.name
       ORDER BY d.id`,
      [now]
    );
    return rows.map((r) => ({
      deck_id: r.id,
      deck_name: r.name,
      total: r.total ?? 0,
      due: r.due ?? 0,
      newCount: r.newCount ?? 0,
      learning: r.learning ?? 0,
      review: r.review ?? 0,
    }));
  } catch {
    return browserGetDeckStats();
  }
}

export async function updateCardState(state: CardState): Promise<void> {
  if (!isTauri()) return browserUpdateCardState(state);
  try {
    const db = await getDb();
    await db.execute(
      "UPDATE card_state SET due_at=$1, interval=$2, ease=$3, reps=$4, state=$5, updated_at=$6 WHERE card_id=$7",
      [state.due_at, state.interval, state.ease, state.reps, state.state, state.updated_at, state.card_id]
    );
  } catch {
    return browserUpdateCardState(state);
  }
}

export async function logReview(cardId: number, grade: number): Promise<void> {
  if (!isTauri()) return browserLogReview(cardId, grade);
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.execute("INSERT INTO reviews (card_id, grade, created_at) VALUES ($1,$2,$3)", [cardId, grade, now]);
  } catch {
    return browserLogReview(cardId, grade);
  }
}

export async function getCounts(): Promise<{ total: number; due: number; newCount: number }> {
  if (!isTauri()) {
    const stats = await browserGetDeckStats();
    return {
      total: stats.reduce((a, s) => a + s.total, 0),
      due: stats.reduce((a, s) => a + s.due, 0),
      newCount: stats.reduce((a, s) => a + s.newCount, 0),
    };
  }
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    const r = await db.select<{ total: number; due: number; newCount: number }[]>(
      `SELECT COUNT(*) as total,
         SUM(CASE WHEN cs.state!='new' AND cs.due_at <= $1 THEN 1 ELSE 0 END) as due,
         SUM(CASE WHEN cs.state='new' THEN 1 ELSE 0 END) as newCount
       FROM cards c JOIN card_state cs ON cs.card_id=c.id`,
      [now]
    );
    return {
      total: r[0]?.total ?? 0,
      due: r[0]?.due ?? 0,
      newCount: r[0]?.newCount ?? 0,
    };
  } catch {
    const stats = await browserGetDeckStats();
    return {
      total: stats.reduce((a, s) => a + s.total, 0),
      due: stats.reduce((a, s) => a + s.due, 0),
      newCount: stats.reduce((a, s) => a + s.newCount, 0),
    };
  }
}

export async function exportAllCards(): Promise<CardWithState[]> {
  return getAllCardsWithState();
}

export async function bulkCreateCards(
  rows: { deckName: string; front: string; back: string; tags: string }[]
): Promise<number> {
  if (!isTauri()) return browserBulkCreateCards(rows);
  try {
    const decks = await getDecks();
    const deckMap = new Map(decks.map((d) => [d.name.toLowerCase(), d.id]));
    let created = 0;
    for (const r of rows) {
      const deckId = deckMap.get(r.deckName.toLowerCase());
      if (!deckId) continue;
      if (!r.front.trim() || !r.back.trim()) continue;
      await createCard(deckId, r.front, r.back, r.tags);
      created++;
    }
    return created;
  } catch {
    return browserBulkCreateCards(rows);
  }
}
