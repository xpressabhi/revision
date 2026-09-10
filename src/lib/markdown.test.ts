import { describe, expect, it } from "vitest";
import { parseCloze, renderMarkdown } from "./markdown";

describe("markdown rendering", () => {
  it("renders basic markdown", () => {
    const html = renderMarkdown("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("escapes raw HTML", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("neutralizes quote-based attribute injection in markdown links", () => {
    const html = renderMarkdown('[click](https://example.com/" onmouseover="alert(1))');
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain("&quot;");
  });

  it("neutralizes quote-based attribute injection in cloze hints", () => {
    const html = renderMarkdown('{{c1::answer::hint" onmouseover="alert(1)}}', "all");
    expect(html).not.toContain('onmouseover="alert(1)"');
  });

  it("masks and reveals cloze blocks progressively", () => {
    const source = "The {{c1::mitochondria}} is the {{c2::powerhouse}}.";
    const masked = renderMarkdown(source, 0);
    expect(masked).toContain("cloze-mask");
    expect(masked).not.toContain("mitochondria");
    const partial = renderMarkdown(source, 1);
    expect(partial).toContain("mitochondria");
    expect(partial).not.toContain("powerhouse");
    const all = renderMarkdown(source, "all");
    expect(all).toContain("powerhouse");
  });

  it("parses cloze tokens with hints", () => {
    const { tokens } = parseCloze("{{c1::answer::hint text}}");
    expect(tokens).toEqual([{ n: 1, text: "answer", hint: "hint text" }]);
  });

  it("linkifies bare URLs with safe rel attributes", () => {
    const html = renderMarkdown("See https://example.com for more.");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
