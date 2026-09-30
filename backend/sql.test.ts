import { describe, expect, it } from "vitest";
import { normalizeParams, translatePlaceholders } from "./sql";

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
