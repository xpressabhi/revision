// Local, offline, deterministic "AI" helpers — heuristic text analysis, no API key.
// Powers the AI hint generator (inspector) and the quick card generator (editor drawer).

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STOPS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "it", "its", "this", "that",
  "as", "by", "at", "from", "can", "could", "would", "should", "will", "may",
  "not", "no", "so", "if", "then", "than", "when", "where", "which", "who", "whom",
]);

function keyTerms(text: string, limit: number): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOPS.has(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([w]) => w);
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 15 && /[A-Za-z]/.test(s));
}

/** Progressive hint levels for the current card: initials → word lengths → key terms. */
export function generateHints(front: string, back: string): string[] {
  const combined = `${front} ${back}`;
  const words = combined.replace(/\{\{c\d+::/g, "").replace(/\}\}/g, "").split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  const unique = [...new Set(words)];
  const picks = unique.slice(0, 7);
  const initials = picks.map((w) => `${w[0]}`).join(" · ");
  const lengths = picks.map((w) => w[0] + " ".repeat(Math.min(6, Math.max(1, w.length - 1)))).join(" · ");
  const terms = keyTerms(`${front} ${back}`, 6).join(", ");
  return [
    `First letters of the answer region: ${initials}…`,
    `Word shapes: ${lengths} (${picks.length} terms)`,
    `Key terms to mention: ${terms}.`,
    `Re-read the back of the card once, then recall it without looking.`,
  ];
}

/** Deterministic per-text hint queue. */
export function hintQueueFor(title: string, front: string, back: string): string[] {
  const base = generateHints(front, back);
  const rnd = mulberry32(hashStr(title + front));
  return base.map((h, i) => (i < 2 ? h : rnd() < 0.5 ? h : h));
}

export type GeneratedVariant = { front: string; back: string; tags: string; note: string };

/**
 * Generate Q&A / Cloze / Flashcard variants from raw text.
 * Heuristic + deterministic; difficulty 1..5 controls how aggressive the
 * cloze masking is and how terse the back side is.
 */
export function generateVariants(source: string, mode: "qa" | "cloze" | "cards", difficulty: number, deckTag: string): GeneratedVariant[] {
  const rnd = mulberry32(hashStr(source + mode + difficulty));
  const sents = sentences(source);
  const clean = (s: string) => s.replace(/^\s*[-*•]\s*/, "").trim();
  const variants: GeneratedVariant[] = [];

  const nWanted = difficulty >= 4 ? 4 : 3;
  for (let i = 0; i < nWanted; i++) {
    if (sents.length === 0) break;
    const s = clean(sents[Math.floor(rnd() * sents.length)]);
    if (mode === "qa") {
      const terms = keyTerms(s, difficulty >= 3 ? 3 : 2);
      const blank = terms[Math.floor(rnd() * terms.length)];
      if (!blank) continue;
      const front = `What is **${blank}** in context of this passage?`;
      const back = s;
      variants.push({ front, back, tags: deckTag, note: "Q&A · key term" });
    } else if (mode === "cloze") {
      const terms = keyTerms(s, difficulty >= 4 ? 4 : 3);
      const take = Math.min(terms.length, difficulty >= 3 ? 2 : 1);
      let work = s;
      for (let k = 0; k < take; k++) {
        const term = terms[k];
        const re = new RegExp(`\\b${escapeRe(term)}\\b`, "i");
        work = work.replace(re, `{{c${k + 1}::${term}}}`);
      }
      if (!work.includes("{{c")) continue;
      variants.push({ front: work, back: clean(s), tags: deckTag, note: `Cloze · ${take} gap(s)` });
    } else {
      const terms = keyTerms(s, 3);
      const term = terms[Math.floor(rnd() * terms.length)] ?? clean(s).split(" ")[0];
      variants.push({
        front: `**Flashcard:** ${term}`,
        back: clean(s),
        tags: deckTag,
        note: "Flashcard · term→definition",
      });
    }
  }

  if (variants.length === 0) {
    variants.push({
      front: `**Recall:** ${clean(source).slice(0, 80)}…`,
      back: clean(source),
      tags: deckTag,
      note: "Fallback · full passage",
    });
  }
  return variants;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Crude "is this prompt-shaped text" detection — nothing sent anywhere. */
export function looksLikePrompt(text: string): boolean {
  return /(https?:\/\/|^\s*(question|q:|prompt|define|explain))/im.test(text);
}