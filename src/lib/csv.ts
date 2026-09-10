export function parseCsv(text: string): { deck: string; front: string; back: string; tags: string }[] {
  const records = splitRecords(text);
  if (records.length === 0) return [];
  const header = splitCsvLine(records[0]).map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes("front") || header.includes("back") || header.includes("deck");
  const startIdx = hasHeader ? 1 : 0;
  const deckIdx = hasHeader ? header.indexOf("deck") : -1;
  const frontIdx = hasHeader ? header.indexOf("front") : -1;
  const backIdx = hasHeader ? header.indexOf("back") : -1;
  const tagsIdx = hasHeader ? header.indexOf("tags") : 2;

  const actualFrontIdx = frontIdx === -1 ? (hasHeader ? 1 : 0) : frontIdx;
  const actualBackIdx = backIdx === -1 ? (hasHeader ? 2 : 1) : backIdx;

  const rows: { deck: string; front: string; back: string; tags: string }[] = [];
  for (let i = startIdx; i < records.length; i++) {
    const cols = splitCsvLine(records[i]);
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

/** Split on newlines that are outside quoted fields, so quoted values may span lines. */
function splitRecords(text: string): string[] {
  const records: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      cur += ch;
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      records.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  records.push(cur);
  return records.filter((r) => r.trim().length > 0);
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
