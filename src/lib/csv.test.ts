import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("csv", () => {
  it("parses a headered file", () => {
    const rows = parseCsv("deck,front,back,tags\nRevision,What is 2+2?,4,math\n");
    expect(rows).toEqual([{ deck: "Revision", front: "What is 2+2?", back: "4", tags: "math" }]);
  });

  it("parses quoted commas and escaped quotes", () => {
    const rows = parseCsv('front,back\n"a, b","say ""hi"""');
    expect(rows[0].front).toBe("a, b");
    expect(rows[0].back).toBe('say "hi"');
  });

  it("parses files without a header as front,back,tags", () => {
    const rows = parseCsv("What is 2+2?,4,math");
    expect(rows[0]).toEqual({ deck: "", front: "What is 2+2?", back: "4", tags: "math" });
  });

  it("round-trips multi-line quoted fields", () => {
    const original = [{ deck: 'D, "1"', front: "line1\nline2", back: "b", tags: "" }];
    const rows = parseCsv(toCsv(original));
    expect(rows).toHaveLength(1);
    expect(rows[0].deck).toBe('D, "1"');
    expect(rows[0].front).toBe("line1\nline2");
  });

  it("skips rows missing front or back", () => {
    expect(parseCsv("front,back\n,onlyback\nonlyfront,")).toEqual([]);
  });
});
