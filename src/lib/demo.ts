// Optional demo content: multi-topic decks (as tag trees) + synthetic FSRS review
// history so the dashboard, heatmap and analytics are alive on first run.
// Deterministic (seeded) — safe to re-run, creates a fresh tagged namespace `demo`.

import { createCard, getDecks, logReviewAt, updateCardState, getAllCardsWithState } from "./db";
import { initDb } from "./db";
import { nextState } from "./fsrs";
import type { CardState } from "./types";
import { mulberry32 } from "./ai";

type DemoCard = { tags: string; front: string; back: string };

const DEMO_CARDS: DemoCard[] = [
  // ——— Spanish · Vocabulary ———
  { tags: "spanish>vocab", front: "La casa **{{c1::grande::big}}** tiene un jardín.", back: "The **big** house has a garden." },
  { tags: "spanish>vocab", front: "Necesito comprar **{{c1::leche}}** y {{c2::pan}} en el supermercado.", back: "I need to buy **milk** and **bread** at the supermarket." },
  { tags: "spanish>vocab", front: "¿Puedes **{{c1::hablar}}** más despacio, por favor?", back: "Can you **speak** more slowly, please?" },
  { tags: "spanish>vocab", front: "El tren **{{c1::sale}}** {{c2::a las cinco}} de la estación.", back: "The train **leaves** **at five** from the station." },
  { tags: "spanish>vocab", front: "Me gusta **{{c1::leer}}** {{c2::novelas}} antes de dormir.", back: "I like to **read** **novels** before sleeping." },
  { tags: "spanish>vocab", front: "¿Cuál es la capital de España?", back: "**Madrid.** Spanish: *Madrid es la capital de España.*" },
  { tags: "spanish>vocab", front: "El restaurante está **cerca de** la plaza mayor.", back: "The restaurant is **near** the main square." },
  { tags: "spanish>grammar", front: "Conjugate **ir** (to go) in the present for *yo/ellos*.", back: "yo **voy**, ellos **van**." },
  { tags: "spanish>grammar", front: "¿Preterite or imperfect? *Cuando era niño, ___ en Madrid.*", back: "**vivía** → imperfect (ongoing state in the past)." },
  { tags: "spanish>grammar", front: "___ (ser / estar): *La sopa está ___ (a) caliente, (b) lista, (c) aburrida.*", back: "(a) caliente → **estar** for condition; **ser** for identity." },
  // ——— Biology · Cell ———
  { tags: "bio>cell", front: "The mitochondria is the **{{c1::powerhouse}}** of the cell, converting {{c2::glucose}} into **ATP**.", back: "It performs **cellular respiration**: glucose + O₂ → ATP + CO₂ + H₂O." },
  { tags: "bio>cell", front: "$$E_{cell} = ...$$ Which organelle has a **double membrane**?", back: "The **mitochondrion** (outer + inner membrane with cristae)." },
  { tags: "bio>cell", front: "The **{{c1::nucleus}}** houses {{c2::genetic material}} in eukaryotic cells.", back: "The **nucleus** stores DNA and coordinates transcription." },
  { tags: "bio>cell", front: "Endosymbiotic theory — explain in one sentence.", back: "Mitochondria (and chloroplasts) were once free-living prokaryotes engulfed by early eukaryotes." },
  { tags: "bio>cell", front: "Which organelle **synthesizes proteins**?", back: "**Ribosomes** (free in cytoplasm or bound to rough ER)." },
  { tags: "bio>cell", front: "Osmosis = movement of **{{c1::water}}** across a {{c2::semipermeable}} membrane.", back: "Water moves from **lower solute → higher solute** concentration (passive)." },
  { tags: "bio>cells", front: "What happens in **Krebs cycle**?", back: "Acetyl-CoA is oxidized in the mitochondrial matrix → NADH, FADH₂, ATP, CO₂." },
  // ——— DSA · Patterns ———
  { tags: "dsa>patterns", front: "Two Sum — pattern, approach, complexity?", back: "**Hash map:** for each `x`, check `target-x` seen. O(n) time / O(n) space." },
  { tags: "dsa>patterns", front: "Sliding window — **when** does it apply?", back: "Contiguous subarray + constraint (max/min length, sum, ≤ k distinct). Shrink while invalid." },
  { tags: "dsa>patterns", front: "DFS vs BFS space tradeoff?", back: "DFS O(h) stack — good for paths/topological. BFS O(w) queue — good for shortest path." },
  { tags: "dsa>patterns", front: "Binary search template — invariant?", back: "`lo, hi` maintain the *predicate boundary*; `mid = lo + (hi-lo)/2`; narrow on predicate." },
  { tags: "dsa>patterns", front: "Which data structure for **LRU cache**?", back: "HashMap + doubly-linked list: O(1) get/put, evict tail." },
  { tags: "dsa>patterns", front: "Monotonic stack — canonical example?", back: "Next greater element. Stack keeps decreasing values; pop while smaller." },
  { tags: "dsa>patterns", front: "Trie — where used?", back: "Prefix searches, autocomplete, IP routing. O(L) lookup independent of corpus." },
  // ——— System Design · Distributed ———
  { tags: "sd>distributed", front: "CAP theorem: pick CP or AP?", back: "RDBMS → CP (or CA without partitions). Dynamo/Cassandra → AP. **Always** chose under partition." },
  { tags: "sd>distributed", front: "Cache-aside vs write-through — tradeoff?", back: "Cache-aside: lazy, stale risk, simple. Write-through: strong consistency, higher write latency." },
  { tags: "sd>distributed", front: "Shard key requirements?", back: "High cardinality, uniform distribution, query support. Avoid hot keys (country)." },
  { tags: "sd>distributed", front: "URL shortener scale — how many rows in 5 years?", back: "~100M URLs/day → ~100B rows → ~5TB metadata. Base62 vs 7-char random." },
  { tags: "sd>distributed", front: "Rate limiter — token bucket vs sliding window?", back: "Token bucket: burst-friendly. Sliding window log: precise, more memory. Redis + Lua for distributed." },
  { tags: "sd>distributed", front: "Why **eventual consistency** for feed systems?", back: "Availability + partition tolerance beat strong read-after-write consistency; tolerable for non-critical data." },
  { tags: "sd>distributed", front: "$QPS = \\frac{100 \\times 10^6}{86400}$ — why does this matter in capacity planning?", back: "≈1,157 QPS average → peak ~3–4× that. Capacity must target **peak**, not average." },
  { tags: "sd>distributed", front: "Two types of **load balancer** health checks?", back: "Active (probe requests) vs passive (observing traffic). L4 (TCP) vs L7 (HTTP) routing." },
];

const GRADES = [2, 3, 3, 3, 4, 3] as const;

export async function loadDemoData(): Promise<{ cards: number; reviews: number }> {
  await initDb();
  const decks = await getDecks();
  const defaultDeck = decks[0];
  if (!defaultDeck) throw new Error("No deck available");

  const now = new Date();
  const rnd = mulberry32(0x52ec_52);
  let cards = 0;
  let reviews = 0;

  for (let i = 0; i < DEMO_CARDS.length; i++) {
    const card = DEMO_CARDS[i];
    await createCard(defaultDeck.id, card.front, card.back, card.tags);
    cards++;
  }

  // Synthetic history: pull each card through 7–12 reviews over the past ~110 days.
  const all = await getAllCardsWithState();
  const seeded = all.filter((c) => c.tags.includes("spanish") || c.tags.includes("bio") || c.tags.includes("dsa") || c.tags.includes("sd"));
  for (const card of seeded) {
    const rounds = 4 + Math.floor(rnd() * 6); // 4–9 reviews per card
    const startOffset = 30 + Math.floor(rnd() * 70); // days ago
    let at = new Date(now.getTime() - startOffset * 86_400_000);
    let st: CardState = {
      card_id: card.id,
      due_at: at.toISOString(),
      interval: 0,
      ease: 2.5,
      reps: 0,
      state: "new",
      stability: 0,
      difficulty: 5,
      updated_at: at.toISOString(),
    };
    for (let r = 0; r < rounds; r++) {
      const grade = GRADES[Math.floor(rnd() * GRADES.length)];
      st = nextState(st, grade, at);
      await logReviewAt(card.id, grade, at);
      reviews++;
      // Simulate reviewing well *ahead* of schedule (R ≈ 0.95) — keeps stability
      // growth gentle: ~1.5× per successful rep, like a disciplined user.
      const gap = Math.max(1, (new Date(st.due_at).getTime() - at.getTime()) * 0.45);
      at = new Date(at.getTime() + gap);
      if (at.getTime() > now.getTime()) break;
    }
    // Sprinkle: ~25% of cards end up due today; a couple stuck in learning.
    if (rnd() < 0.3 && st.updated_at < now.toISOString()) {
      st.due_at = new Date(now.getTime() - 2 * 3_600_000).toISOString();
    } else if (rnd() < 0.12) {
      st.state = "learning";
      st.due_at = new Date(now.getTime() + 15 * 60_000).toISOString();
    }
    if (st.due_at > now.toISOString() && rnd() < 0.35 && st.state !== "learning") {
      st.due_at = new Date(now.getTime() + Math.floor(rnd() * 9) * 86_400_000).toISOString();
    }
    st.updated_at = now.toISOString();
    await updateCardState(st);
  }

  return { cards, reviews };
}

export { DEMO_CARDS };