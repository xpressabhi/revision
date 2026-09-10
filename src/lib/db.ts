import type Database from "@tauri-apps/plugin-sql";
import type { CardState, CardWithState, Deck, DeckStats, ReviewRow } from "./types";
import { DEFAULT_EASE, DEFAULT_STABILITY, DEFAULT_DIFFICULTY } from "./fsrs";
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
  browserLogReviewAt,
  browserGetReviews,
  browserBulkCreateCards,
  browserClearAllCards,
  browserDeduplicateCards,
  browserDeleteLastReview,
} from "./db.browser";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

const useBrowserStorage = !isTauriRuntime();

let dbInstance: Database | null = null;

async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  const mod = await import("@tauri-apps/plugin-sql");
  dbInstance = await mod.default.load("sqlite:revision.db");
  return dbInstance;
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

async function migrateToSingleDeckTauri(db: Database) {
  const now = new Date().toISOString();
  const rev = await db.select<{ id: number; name: string }[]>("SELECT id FROM decks WHERE name = $1", ["Revision"]);
  let revisionId: number;
  if (rev.length === 0) {
    const r = await db.execute("INSERT INTO decks (name, created_at) VALUES ($1, $2)", ["Revision", now]);
    revisionId = r.lastInsertId ?? 0;
  } else {
    revisionId = rev[0].id;
  }
  const allDecks = await db.select<{ id: number; name: string }[]>("SELECT id, name FROM decks");
  if (allDecks.length <= 1) return;

  await db.execute("BEGIN");
  try {
    for (const deck of allDecks) {
      if (deck.id === revisionId) continue;
      const tag = deckNameToTag(deck.name);
      const cards = await db.select<{ id: number; tags: string }[]>("SELECT id, tags FROM cards WHERE deck_id = $1", [deck.id]);
      for (const card of cards) {
        const tags = card.tags || "";
        const hasTag = tags.split(",").map((t) => t.trim().toLowerCase()).includes(tag);
        const newTags = hasTag ? tags : tags ? `${tags}, ${tag}` : tag;
        await db.execute("UPDATE cards SET deck_id = $1, tags = $2, updated_at = $3 WHERE id = $4", [revisionId, newTags, now, card.id]);
      }
      await db.execute("DELETE FROM decks WHERE id = $1", [deck.id]);
    }
    await db.execute("COMMIT");
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }
}

export async function initDb(): Promise<void> {
  if (useBrowserStorage) return browserInitDb();
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
      stability REAL NOT NULL DEFAULT ${DEFAULT_STABILITY},
      difficulty REAL NOT NULL DEFAULT ${DEFAULT_DIFFICULTY},
      updated_at TEXT NOT NULL
    );
  `);
  const stateCols = await db.select<{ name: string }[]>("PRAGMA table_info(card_state)");
  const hasStab = stateCols.some((c) => c.name === "stability");
  const hasDiff = stateCols.some((c) => c.name === "difficulty");
  if (!hasStab) await db.execute(`ALTER TABLE card_state ADD COLUMN stability REAL NOT NULL DEFAULT ${DEFAULT_STABILITY}`);
  if (!hasDiff) await db.execute(`ALTER TABLE card_state ADD COLUMN difficulty REAL NOT NULL DEFAULT ${DEFAULT_DIFFICULTY}`);
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
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_reviews_card ON reviews(card_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at);`);

  const existing = await db.select<{ cnt: number }[]>("SELECT COUNT(*) as cnt FROM decks");
  if (existing[0].cnt === 0) {
    const now = new Date().toISOString();
    await db.execute("INSERT INTO decks (name, created_at) VALUES ($1, $2)", ["Revision", now]);
  } else {
    const nonRevision = await db.select<{ cnt: number }[]>("SELECT COUNT(*) as cnt FROM decks WHERE name != $1", ["Revision"]);
    if (nonRevision[0].cnt > 0) {
      await migrateToSingleDeckTauri(db);
    }
  }
  await db.execute(
    `INSERT OR IGNORE INTO card_state (card_id, due_at, interval, ease, reps, state, stability, difficulty, updated_at)
     SELECT id, updated_at, 0, ${DEFAULT_EASE}, 0, 'new', ${DEFAULT_STABILITY}, ${DEFAULT_DIFFICULTY}, updated_at FROM cards
     WHERE id NOT IN (SELECT card_id FROM card_state)`
  );
  await db.execute(
    `UPDATE card_state SET stability = MAX(1.0, interval) WHERE state = 'review' AND stability <= 0`
  );
}

export async function getDecks(): Promise<Deck[]> {
  if (useBrowserStorage) return browserGetDecks();
  const db = await getDb();
  return db.select<Deck[]>("SELECT * FROM decks ORDER BY id ASC");
}

export async function createDeck(name: string): Promise<void> {
  if (useBrowserStorage) return browserCreateDeck(name);
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute("INSERT INTO decks (name, created_at) VALUES ($1, $2)", [name.trim(), now]);
}

export async function deleteDeck(id: number): Promise<void> {
  if (useBrowserStorage) return browserDeleteDeck(id);
  const db = await getDb();
  await db.execute("DELETE FROM decks WHERE id=$1", [id]);
}

export async function createCard(
  deckId: number,
  front: string,
  back: string,
  tags: string
): Promise<number> {
  if (useBrowserStorage) return browserCreateCard(deckId, front, back, tags);
  const db = await getDb();
  const now = new Date().toISOString();
  const res = await db.execute(
    "INSERT INTO cards (deck_id, front, back, tags, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)",
    [deckId, front.trim(), back.trim(), tags.trim(), now, now]
  );
  const cardId = res.lastInsertId ?? 0;
  await db.execute(
    "INSERT INTO card_state (card_id, due_at, interval, ease, reps, state, stability, difficulty, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [cardId, now, 0, DEFAULT_EASE, 0, "new", DEFAULT_STABILITY, DEFAULT_DIFFICULTY, now]
  );
  return cardId;
}

export async function updateCard(
  id: number,
  deckId: number,
  front: string,
  back: string,
  tags: string
): Promise<void> {
  if (useBrowserStorage) return browserUpdateCard(id, deckId, front, back, tags);
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE cards SET deck_id=$1, front=$2, back=$3, tags=$4, updated_at=$5 WHERE id=$6",
    [deckId, front.trim(), back.trim(), tags.trim(), now, id]
  );
}

export async function deleteCard(id: number): Promise<void> {
  if (useBrowserStorage) return browserDeleteCard(id);
  const db = await getDb();
  await db.execute("DELETE FROM cards WHERE id=$1", [id]);
}

export async function getAllCardsWithState(opts?: {
  deckId?: number | null;
  search?: string;
  state?: string | null;
}): Promise<CardWithState[]> {
  if (useBrowserStorage) return browserGetAllCardsWithState(opts);
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
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
    SELECT c.*, d.name as deck_name, cs.state, cs.due_at, cs.interval, cs.ease, cs.reps, cs.stability, cs.difficulty
    FROM cards c
    JOIN decks d ON d.id = c.deck_id
    JOIN card_state cs ON cs.card_id = c.id
    ${whereCl}
    ORDER BY cs.due_at ASC, c.updated_at DESC
  `;
  return db.select<CardWithState[]>(sql, params);
}

export async function getDueCards(limitNew = 20): Promise<CardWithState[]> {
  if (useBrowserStorage) return browserGetDueCards(limitNew);
  const db = await getDb();
  const now = new Date().toISOString();
  const due = await db.select<CardWithState[]>(
    `SELECT c.*, d.name as deck_name, cs.state, cs.due_at, cs.interval, cs.ease, cs.reps, cs.stability, cs.difficulty
     FROM cards c JOIN decks d ON d.id=c.deck_id JOIN card_state cs ON cs.card_id=c.id
     WHERE cs.due_at <= $1 AND cs.state != 'new'
     ORDER BY cs.due_at ASC LIMIT 200`,
    [now]
  );
  const newCards = await db.select<CardWithState[]>(
    `SELECT c.*, d.name as deck_name, cs.state, cs.due_at, cs.interval, cs.ease, cs.reps, cs.stability, cs.difficulty
     FROM cards c JOIN decks d ON d.id=c.deck_id JOIN card_state cs ON cs.card_id=c.id
     WHERE cs.state='new'
     ORDER BY c.created_at ASC LIMIT $1`,
    [limitNew]
  );
  return [...due, ...newCards];
}

export async function getDeckStats(): Promise<DeckStats[]> {
  if (useBrowserStorage) return browserGetDeckStats();
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
}

export async function updateCardState(state: CardState): Promise<void> {
  if (useBrowserStorage) return browserUpdateCardState(state);
  const db = await getDb();
  await db.execute(
    "UPDATE card_state SET due_at=$1, interval=$2, ease=$3, reps=$4, state=$5, stability=$6, difficulty=$7, updated_at=$8 WHERE card_id=$9",
    [state.due_at, state.interval, state.ease, state.reps, state.state, state.stability, state.difficulty, state.updated_at, state.card_id]
  );
}

export async function logReview(cardId: number, grade: number): Promise<void> {
  return logReviewAt(cardId, grade, new Date());
}

export async function logReviewAt(cardId: number, grade: number, when: Date): Promise<void> {
  if (useBrowserStorage) return browserLogReviewAt(cardId, grade, when);
  const db = await getDb();
  await db.execute("INSERT INTO reviews (card_id, grade, created_at) VALUES ($1,$2,$3)", [cardId, grade, when.toISOString()]);
}

export async function deleteLastReview(cardId: number): Promise<void> {
  if (useBrowserStorage) return browserDeleteLastReview(cardId);
  const db = await getDb();
  await db.execute(
    "DELETE FROM reviews WHERE id = (SELECT id FROM reviews WHERE card_id=$1 ORDER BY id DESC LIMIT 1)",
    [cardId]
  );
}

export async function getReviews(): Promise<ReviewRow[]> {
  if (useBrowserStorage) return browserGetReviews();
  const db = await getDb();
  return db.select<ReviewRow[]>("SELECT id, card_id, grade, created_at FROM reviews ORDER BY created_at ASC");
}

export async function exportAllCards(): Promise<CardWithState[]> {
  return getAllCardsWithState();
}

export async function bulkCreateCards(
  rows: { deckName: string; front: string; back: string; tags: string }[]
): Promise<number> {
  if (useBrowserStorage) return browserBulkCreateCards(rows);
  const decks = await getDecks();
  const deckMap = new Map(decks.map((d) => [d.name.toLowerCase(), d.id]));
  const singleId = decks.length === 1 ? decks[0].id : null;
  let created = 0;
  for (const r of rows) {
    let deckId = deckMap.get(r.deckName.toLowerCase());
    let extraTag: string | null = null;
    if (!deckId && singleId) {
      deckId = singleId;
      extraTag = deckNameToTag(r.deckName);
    }
    if (!deckId) continue;
    if (!r.front.trim() || !r.back.trim()) continue;
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

export async function clearAllCards(): Promise<void> {
  if (useBrowserStorage) return browserClearAllCards();
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    await db.execute("DELETE FROM reviews");
    await db.execute("DELETE FROM card_state");
    await db.execute("DELETE FROM cards");
    await db.execute("DELETE FROM sqlite_sequence WHERE name='cards' OR name='reviews'");
    await db.execute("COMMIT");
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }
}

export async function deduplicateCards(): Promise<number> {
  if (useBrowserStorage) return browserDeduplicateCards();
  const all = await getAllCardsWithState();
  const seen = new Map<string, number>();
  let removed = 0;
  for (const c of all) {
    const key = `${c.deck_id}::${c.front.trim()}`;
    if (!seen.has(key)) {
      seen.set(key, c.id);
    } else {
      await deleteCard(c.id);
      removed++;
    }
  }
  return removed;
}
