export function parseCsv(text: string): { deck: string; front: string; back: string; tags: string }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  // Detect header
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const hasHeader =
    header.includes("front") || header.includes("back") || header.includes("deck");
  const startIdx = hasHeader ? 1 : 0;
  const deckIdx = hasHeader ? header.indexOf("deck") : 0;
  const frontIdx = hasHeader ? header.indexOf("front") : hasHeader ? -1 : 0;
  const backIdx = hasHeader ? header.indexOf("back") : hasHeader ? -1 : 1;
  const tagsIdx = hasHeader ? header.indexOf("tags") : 2;

  const actualFrontIdx = frontIdx === -1 ? (hasHeader ? 1 : 0) : frontIdx;
  const actualBackIdx = backIdx === -1 ? (hasHeader ? 2 : 1) : backIdx;

  const rows: { deck: string; front: string; back: string; tags: string }[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 2) continue;
    const deck = deckIdx >= 0 ? (cols[deckIdx] ?? "").trim() : "";
    const front = (cols[actualFrontIdx] ?? "").trim();
    const back = (cols[actualBackIdx] ?? "").trim();
    const tags = tagsIdx >= 0 ? (cols[tagsIdx] ?? "").trim() : "";
    if (!front || !back) continue;
    rows.push({ deck, front, back, tags });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map((s) => s.trim().replace(/^"(.*)"$/, "$1"));
}

export function toCsv(
  rows: { deck: string; front: string; back: string; tags: string }[]
): string {
  const header = "deck,front,back,tags";
  const esc = (s: string) => {
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return [header, ...rows.map((r) => [esc(r.deck), esc(r.front), esc(r.back), esc(r.tags)].join(","))].join("\n");
}
