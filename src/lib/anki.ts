import Database from "@tauri-apps/plugin-sql";
import type { ImportCardRow } from "./types";

type AnkiNote = { id: number; flds: string; tags: string };
type AnkiCard = { nid: number; did: number; type: number; ivl: number; reps: number };

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/\[sound:[^\]]*\]/gi, "")
      .replace(/\[img:[^\]]*\]/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li|h[1-6])>/gi, "\n\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function deckTag(name: string): string {
  return name
    .split("::")
    .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .join(">");
}

/** Read the staged Anki SQLite file and return rows ready for `importCards`. */
export async function parseAnkiCollection(relPath: string): Promise<ImportCardRow[]> {
  const db = await Database.load(`sqlite:${relPath}`);
  try {
    let deckNames: Record<string, string> = {};
    try {
      const col = await db.select<{ decks: string }[]>("SELECT decks FROM col LIMIT 1");
      const parsed = JSON.parse(col[0]?.decks ?? "{}") as Record<string, { name?: string }>;
      for (const [id, d] of Object.entries(parsed)) deckNames[id] = d?.name ?? "";
    } catch {
      const decks = await db.select<{ id: number; name: string }[]>("SELECT id, name FROM decks");
      for (const d of decks) deckNames[String(d.id)] = d.name;
    }

    const notes = await db.select<AnkiNote[]>("SELECT id, flds, tags FROM notes");
    const cards = await db.select<AnkiCard[]>("SELECT nid, did, type, ivl, reps FROM cards");
    const cardByNote = new Map<number, AnkiCard>();
    for (const c of cards) if (!cardByNote.has(c.nid)) cardByNote.set(c.nid, c);

    const now = Date.now();
    const rows: ImportCardRow[] = [];
    for (const note of notes) {
      const fields = (note.flds ?? "").split("\u001f");
      const front = htmlToText(fields[0] ?? "");
      const back = htmlToText(fields.slice(1).join("\n\n")) || front;
      if (!front) continue;
      const tag = deckTag(deckNames[String(cardByNote.get(note.id)?.did ?? 1)] ?? "");
      const noteTags = (note.tags ?? "").trim().split(/\s+/).filter(Boolean);
      const tags = [tag, ...noteTags].filter(Boolean).join(", ");
      const card = cardByNote.get(note.id);
      const isReview = card?.type === 2 && (card?.ivl ?? 0) > 0;
      const ivl = Math.max(1, Math.min(365, card?.ivl ?? 1));
      rows.push({
        front,
        back,
        tags,
        state: isReview ? "review" : "new",
        due_at: isReview ? new Date(now + Math.min(30, ivl) * 86_400_000).toISOString() : new Date(now).toISOString(),
        interval: isReview ? ivl : 0,
        stability: isReview ? ivl : 0,
        difficulty: 5,
        reps: card?.reps ?? 0,
      });
    }
    return rows;
  } finally {
    await db.close();
  }
}
