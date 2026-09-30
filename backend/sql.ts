/**
 * Rewrite `$n` placeholders to SQLite's native `?n` form.
 *
 * Position-preserving (`$3` becomes `?3`, not the next free slot), so callers
 * keep passing the same params arrays they always have. Quoted text — string
 * literals ('…'), quoted identifiers ("…", `…`, […]) — is copied verbatim so a
 * `$1` inside a literal can never be touched.
 */
export function translatePlaceholders(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      out += ch;
      i++;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "[") {
      out += ch;
      i++;
      while (i < sql.length && sql[i] !== "]") {
        out += sql[i];
        i++;
      }
      if (i < sql.length) {
        out += sql[i];
        i++;
      }
      continue;
    }
    if (ch === "$" && sql[i + 1] !== undefined && sql[i + 1] >= "0" && sql[i + 1] <= "9") {
      let j = i + 1;
      while (j < sql.length && sql[j] >= "0" && sql[j] <= "9") j++;
      out += "?" + sql.slice(i + 1, j);
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Coerce JS values into what the sqlite binding accepts. */
export function normalizeParams(params: unknown[]): (string | number | bigint | null | Uint8Array)[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    return p as string | number | bigint | null | Uint8Array;
  });
}
