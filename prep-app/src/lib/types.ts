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
  updated_at: string;
};

export type CardWithState = Card & {
  state: CardState["state"];
  due_at: string;
  interval: number;
  ease: number;
  reps: number;
};

export type Grade = 1 | 3 | 4; // Again, Good, Easy

export type DeckStats = {
  deck_id: number;
  deck_name: string;
  total: number;
  due: number;
  newCount: number;
  learning: number;
  review: number;
};
