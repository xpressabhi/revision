import { describe, expect, it } from "vitest";
import { normalizeParams, queryAll, runStatement, translatePlaceholders } from "./sql";

describe("translatePlaceholders", () => {
  it("rewrites a single $n", () => {
    expect(translatePlaceholders("SELECT * FROM decks WHERE name = $1")).toBe(
      "SELECT * FROM decks WHERE name = ?1"
    );
  });

  it("rewrites out-of-order and multi-digit placeholders position-preserving", () => {
    expect(
      translatePlaceholders("UPDATE cards SET deck_id = $1, tags = $2, updated_at = $3 WHERE id = $4")
    ).toBe("UPDATE cards SET deck_id = ?1, tags = ?2, updated_at = ?3 WHERE id = ?4");
    expect(translatePlaceholders("SELECT $12, $2")).toBe("SELECT ?12, ?2");
  });

  it("keeps repeated placeholders pointing at the same slot", () => {
    expect(translatePlaceholders("SELECT * FROM t WHERE a = $1 OR b = $1")).toBe(
      "SELECT * FROM t WHERE a = ?1 OR b = ?1"
    );
  });

  it("never touches $n inside string literals", () => {
    expect(translatePlaceholders("SELECT '$1' AS lit, id FROM t WHERE id = $2")).toBe(
      "SELECT '$1' AS lit, id FROM t WHERE id = ?2"
    );
    expect(translatePlaceholders("SELECT 'it''s $1' AS x")).toBe("SELECT 'it''s $1' AS x");
  });

  it("never touches $n inside quoted or bracketed identifiers", () => {
    expect(translatePlaceholders('SELECT "$1" FROM t')).toBe('SELECT "$1" FROM t');
    expect(translatePlaceholders("SELECT `$1`, [$2] FROM t")).toBe("SELECT `$1`, [$2] FROM t");
  });

  it("leaves SQL without placeholders alone", () => {
    expect(translatePlaceholders("SELECT 1")).toBe("SELECT 1");
    expect(translatePlaceholders("SELECT a$b, $, $x FROM t")).toBe("SELECT a$b, $, $x FROM t");
  });
});

describe("normalizeParams", () => {
  it("maps undefined to null and booleans to 0/1", () => {
    expect(normalizeParams([undefined, true, false, 1, "x", null])).toEqual([null, 1, 0, 1, "x", null]);
  });
});

function fakeDb() {
  const calls: { verb: string; sql: string; args: unknown[] }[] = [];
  let finalized = 0;
  return {
    calls,
    finalized: () => finalized,
    prepare(sql: string) {
      return {
        run: (...args: unknown[]) => {
          calls.push({ verb: "run", sql, args });
        },
        all: (...args: unknown[]) => {
          calls.push({ verb: "all", sql, args });
          return [{ row: 1 }];
        },
        finalize: () => {
          finalized++;
        },
      };
    },
  };
}

describe("runStatement / queryAll", () => {
  it("translates placeholders and binds normalized params", () => {
    const db = fakeDb();
    runStatement(db, "UPDATE t SET v = $1 WHERE id = $2", [true, undefined]);
    expect(db.calls[0]).toEqual({ verb: "run", sql: "UPDATE t SET v = ?1 WHERE id = ?2", args: [1, null] });
    expect(db.finalized()).toBe(1);
  });

  it("queryAll returns rows and finalizes", () => {
    const db = fakeDb();
    expect(queryAll(db, "SELECT * FROM t WHERE id = $1", [7])).toEqual([{ row: 1 }]);
    expect(db.calls[0]?.sql).toBe("SELECT * FROM t WHERE id = ?1");
    expect(db.finalized()).toBe(1);
  });
});
