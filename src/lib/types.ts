export type Deck = {
  id: number;
  name: string;
  created_at: string;
};

export type Card = {
  id: number;
  deck_id: number;
  front: string;
  back: string;
  tags: string;
  created_at: string;
  updated_at: string;
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

export type ReviewRow = { id: number; card_id: number; grade: number; created_at: string };

export type View = "dashboard" | "browse" | "review" | "analytics" | "settings";