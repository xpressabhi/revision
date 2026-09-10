import type Database from "@tauri-apps/plugin-sql";
import type { CardState, CardWithState, Deck, DeckStats, ImportCardRow, ReviewRow, SyncCard, SyncFile, SyncReview } from "./types";
import { DEFAULT_EASE, DEFAULT_STABILITY, DEFAULT_DIFFICULTY } from "./fsrs";
import { isTauriRuntime } from "./platform";
import { newUid } from "./ids";
import * as idb from "./db/idb";

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
  if (useBrowserStorage) return idb.initDb();
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
      uid TEXT,
      deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
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
      uid TEXT,
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

  const cardCols = await db.select<{ name: string }[]>("PRAGMA table_info(cards)");
  if (!cardCols.some((c) => c.name === "uid")) await db.execute("ALTER TABLE cards ADD COLUMN uid TEXT");
  if (!cardCols.some((c) => c.name === "deleted_at")) await db.execute("ALTER TABLE cards ADD COLUMN deleted_at TEXT");
  const reviewCols = await db.select<{ name: string }[]>("PRAGMA table_info(reviews)");
  if (!reviewCols.some((c) => c.name === "uid")) await db.execute("ALTER TABLE reviews ADD COLUMN uid TEXT");

  const missingCards = await db.select<{ id: number }[]>("SELECT id FROM cards WHERE uid IS NULL OR uid = ''");
  const missingReviews = await db.select<{ id: number }[]>("SELECT id FROM reviews WHERE uid IS NULL OR uid = ''");
  if (missingCards.length || missingReviews.length) {
    await db.execute("BEGIN");
    try {
      for (const row of missingCards) await db.execute("UPDATE cards SET uid = $1 WHERE id = $2", [newUid(), row.id]);
      for (const row of missingReviews) await db.execute("UPDATE reviews SET uid = $1 WHERE id = $2", [newUid(), row.id]);
      await db.execute("COMMIT");
    } catch (e) {
      await db.execute("ROLLBACK");
      throw e;
    }
  }
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_uid ON cards(uid);`);
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_uid ON reviews(uid);`);

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
     WHERE deleted_at IS NULL AND id NOT IN (SELECT card_id FROM card_state)`
  );
  await db.execute(
    `UPDATE card_state SET stability = MAX(1.0, interval) WHERE state = 'review' AND stability <= 0`
  );
}

export async function getDecks(): Promise<Deck[]> {
  if (useBrowserStorage) return idb.getDecks();
  const db = await getDb();
  return db.select<Deck[]>("SELECT * FROM decks ORDER BY id ASC");
}

export async function createCard(
  deckId: number,
  front: string,
  back: string,
  tags: string
): Promise<number> {
  if (useBrowserStorage) return idb.createCard(deckId, front, back, tags);
  const db = await getDb();
  const now = new Date().toISOString();
  const res = await db.execute(
    "INSERT INTO cards (uid, deck_id, front, back, tags, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [newUid(), deckId, front.trim(), back.trim(), tags.trim(), now, now]
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
  if (useBrowserStorage) return idb.updateCard(id, deckId, front, back, tags);
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE cards SET deck_id=$1, front=$2, back=$3, tags=$4, updated_at=$5 WHERE id=$6",
    [deckId, front.trim(), back.trim(), tags.trim(), now, id]
  );
}

export async function deleteCard(id: number): Promise<void> {
  if (useBrowserStorage) return idb.deleteCard(id);
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute("BEGIN");
  try {
    await db.execute("UPDATE cards SET deleted_at=$1, updated_at=$1 WHERE id=$2", [now, id]);
    await db.execute("DELETE FROM card_state WHERE card_id=$1", [id]);
    await db.execute("DELETE FROM reviews WHERE card_id=$1", [id]);
    await db.execute("COMMIT");
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }
}

export async function getAllCardsWithState(opts?: {
  deckId?: number | null;
  search?: string;
  state?: string | null;
}): Promise<CardWithState[]> {
  if (useBrowserStorage) return idb.getAllCardsWithState(opts);
  const db = await getDb();
  const where: string[] = ["c.deleted_at IS NULL"];
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
  const whereCl = `WHERE ${where.join(" AND ")}`;
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

export async function getDeckStats(): Promise<DeckStats[]> {
  if (useBrowserStorage) return idb.getDeckStats();
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
     LEFT JOIN cards c ON c.deck_id=d.id AND c.deleted_at IS NULL
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
  if (useBrowserStorage) return idb.updateCardState(state);
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
  if (useBrowserStorage) return idb.logReviewAt(cardId, grade, when);
  const db = await getDb();
  await db.execute("INSERT INTO reviews (uid, card_id, grade, created_at) VALUES ($1,$2,$3,$4)", [newUid(), cardId, grade, when.toISOString()]);
}

export async function deleteLastReview(cardId: number): Promise<void> {
  if (useBrowserStorage) return idb.deleteLastReview(cardId);
  const db = await getDb();
  await db.execute(
    "DELETE FROM reviews WHERE id = (SELECT id FROM reviews WHERE card_id=$1 ORDER BY id DESC LIMIT 1)",
    [cardId]
  );
}

export async function getReviews(): Promise<ReviewRow[]> {
  if (useBrowserStorage) return idb.getReviews();
  const db = await getDb();
  return db.select<ReviewRow[]>("SELECT id, uid, card_id, grade, created_at FROM reviews ORDER BY created_at ASC");
}

export async function bulkCreateCards(
  rows: { deckName: string; front: string; back: string; tags: string }[]
): Promise<number> {
  if (useBrowserStorage) return idb.bulkCreateCards(rows);
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

export async function importCards(deckId: number, rows: ImportCardRow[]): Promise<number> {
  if (useBrowserStorage) return idb.importCards(deckId, rows);
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    let created = 0;
    const now = new Date().toISOString();
    for (const r of rows) {
      const res = await db.execute(
        "INSERT INTO cards (uid, deck_id, front, back, tags, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)",
        [newUid(), deckId, r.front.trim(), r.back.trim(), r.tags.trim(), now]
      );
      const id = res.lastInsertId ?? 0;
      await db.execute(
        "INSERT INTO card_state (card_id, due_at, interval, ease, reps, state, stability, difficulty, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [id, r.due_at, r.interval, DEFAULT_EASE, r.reps, r.state, r.stability, r.difficulty, now]
      );
      created++;
    }
    await db.execute("COMMIT");
    return created;
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }
}

async function replaceAllTauri(db: Database, snapshot: { cards: SyncCard[]; reviews: SyncReview[] }): Promise<void> {
  const decks = await getDecks();
  const deckId = decks[0]?.id;
  if (!deckId) throw new Error("No deck to restore into");
  await db.execute("BEGIN");
  try {
    await db.execute("DELETE FROM reviews");
    await db.execute("DELETE FROM card_state");
    await db.execute("DELETE FROM cards");
    await db.execute("DELETE FROM sqlite_sequence WHERE name='cards' OR name='reviews'");
    const uidToId = new Map<string, number>();
    for (const c of snapshot.cards) {
      const res = await db.execute(
        "INSERT INTO cards (uid, deck_id, front, back, tags, created_at, updated_at, deleted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [c.uid, deckId, c.front, c.back, c.tags, c.created_at, c.updated_at, c.deleted_at]
      );
      uidToId.set(c.uid, res.lastInsertId ?? 0);
    }
    for (const c of snapshot.cards) {
      if (c.deleted_at) continue;
      await db.execute(
        "INSERT INTO card_state (card_id, due_at, interval, ease, reps, state, stability, difficulty, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [uidToId.get(c.uid), c.due_at, c.interval, c.ease, c.reps, c.state, c.stability, c.difficulty, c.state_updated_at]
      );
    }
    const deletedUids = new Set(snapshot.cards.filter((c) => c.deleted_at).map((c) => c.uid));
    const rows = snapshot.reviews.filter((r) => !deletedUids.has(r.card_uid));
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values: string[] = [];
      const params: unknown[] = [];
      chunk.forEach((r, j) => {
        const b = j * 4;
        values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4})`);
        params.push(r.uid, uidToId.get(r.card_uid), r.grade, r.created_at);
      });
      await db.execute(`INSERT INTO reviews (uid, card_id, grade, created_at) VALUES ${values.join(",")}`, params);
    }
    await db.execute("COMMIT");
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }
}

export async function applySyncSnapshot(snapshot: { cards: SyncCard[]; reviews: SyncReview[] }): Promise<void> {
  if (useBrowserStorage) return idb.applySyncSnapshot(snapshot);
  const db = await getDb();
  return replaceAllTauri(db, snapshot);
}

export async function restoreBackup(backup: Pick<SyncFile, "cards" | "reviews">): Promise<void> {
  if (useBrowserStorage) return idb.restoreBackup(backup);
  const db = await getDb();
  return replaceAllTauri(db, backup);
}

export async function clearAllCards(): Promise<void> {
  if (useBrowserStorage) return idb.clearAllCards();
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute("BEGIN");
  try {
    await db.execute("UPDATE cards SET deleted_at=$1, updated_at=$1 WHERE deleted_at IS NULL", [now]);
    await db.execute("DELETE FROM reviews");
    await db.execute("DELETE FROM card_state");
    await db.execute("COMMIT");
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }
}

export async function deduplicateCards(): Promise<number> {
  if (useBrowserStorage) return idb.deduplicateCards();
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

export async function getSyncSnapshot(): Promise<{ cards: SyncCard[]; reviews: SyncReview[] }> {
  if (useBrowserStorage) return idb.getSyncSnapshot();
  const db = await getDb();
  const rows = await db.select<
    {
      uid: string;
      front: string;
      back: string;
      tags: string;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
      due_at: string | null;
      interval: number | null;
      ease: number | null;
      reps: number | null;
      state: CardState["state"] | null;
      stability: number | null;
      difficulty: number | null;
      state_updated_at: string | null;
    }[]
  >(
    `SELECT c.uid, c.front, c.back, c.tags, c.created_at, c.updated_at, c.deleted_at,
            cs.due_at, cs.interval, cs.ease, cs.reps, cs.state, cs.stability, cs.difficulty, cs.updated_at as state_updated_at
     FROM cards c
     LEFT JOIN card_state cs ON cs.card_id = c.id`
  );
  const cards: SyncCard[] = rows.map((c) => ({
    uid: c.uid,
    front: c.front,
    back: c.back,
    tags: c.tags,
    created_at: c.created_at,
    updated_at: c.updated_at,
    deleted_at: c.deleted_at,
    due_at: c.due_at ?? c.updated_at,
    interval: c.interval ?? 0,
    ease: c.ease ?? DEFAULT_EASE,
    reps: c.reps ?? 0,
    state: c.state ?? "new",
    stability: c.stability ?? DEFAULT_STABILITY,
    difficulty: c.difficulty ?? DEFAULT_DIFFICULTY,
    state_updated_at: c.state_updated_at ?? c.updated_at,
  }));
  const reviews = await db.select<SyncReview[]>(
    `SELECT r.uid, c.uid as card_uid, r.grade, r.created_at
     FROM reviews r JOIN cards c ON c.id = r.card_id`
  );
  return { cards, reviews };
}

export function onExternalChange(_cb: () => void): () => void {
  return () => {};
}
