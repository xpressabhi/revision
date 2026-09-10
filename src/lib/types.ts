export type Deck = {
  id: number;
  name: string;
  created_at: string;
};

export type Card = {
  id: number;
  uid: string;
  deck_id: number;
  front: string;
  back: string;
  tags: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deck_name?: string;
};

export type CardState = {
  card_id: number;
  due_at: string;
  interval: number;
  ease: number;
  reps: number;
  state: "new" | "learning" | "review";
  /** FSRS stability (days) */
  stability: number;
  /** FSRS difficulty 1..10 */
  difficulty: number;
  updated_at: string;
};

export type CardWithState = Card & {
  state: CardState["state"];
  due_at: string;
  interval: number;
  ease: number;
  reps: number;
  stability: number;
  difficulty: number;
};

/** FSRS ratings: 1 Again · 2 Hard · 3 Good · 4 Easy */
export type Grade = 1 | 2 | 3 | 4;

export type DeckStats = {
  deck_id: number;
  deck_name: string;
  total: number;
  due: number;
  newCount: number;
  learning: number;
  review: number;
};

export type ReviewRow = { id: number; uid: string; card_id: number; grade: number; created_at: string };

/** One card + its scheduling state, identity-stable across devices via `uid`. */
export type SyncCard = {
  uid: string;
  front: string;
  back: string;
  tags: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  due_at: string;
  interval: number;
  ease: number;
  reps: number;
  state: CardState["state"];
  stability: number;
  difficulty: number;
  state_updated_at: string;
};

export type SyncReview = { uid: string; card_uid: string; grade: number; created_at: string };

/**
 * Portable snapshot of all user data. Used for backups (kind "revision-backup")
 * and for file sync between the web and desktop apps (kind "revision-sync").
 */
export type SyncFile = {
  kind: "revision-backup" | "revision-sync";
  version: 2;
  exported_at: string;
  device_id: string;
  device_name: string;
  cards: SyncCard[];
  reviews: SyncReview[];
};

export type BackupFile = SyncFile;

export type ImportCardRow = {
  front: string;
  back: string;
  tags: string;
  state: CardState["state"];
  due_at: string;
  interval: number;
  stability: number;
  difficulty: number;
  reps: number;
};

export type View = "dashboard" | "browse" | "review" | "analytics" | "settings";
