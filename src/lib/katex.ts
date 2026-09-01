import katex from "katex";
import "katex/dist/katex.min.css";

/** Render TeX to an HTML string; never throws, never renders broken glyphs. */
export function texToHtml(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: "html",
    });
  } catch {
    const escaped = tex.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<span class="math-error" title="Could not render LaTeX">${escaped}</span>`;
  }
}

/** Extract $..$ and $$..$$ math from raw source into placeholders; returns [placeholders, escaped-html-with-placeholders]. */
export function extractMath(raw: string): { placeholders: { token: string; html: string }[]; body: string } {
  const placeholders: { token: string; html: string }[] = [];
  const body = raw.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
    const token = `@@MATHB_${placeholders.length}@@`;
    placeholders.push({ token, html: texToHtml(tex, true) });
    return token;
  }).replace(/\$([^$\n]{1,240}?)\$/g, (_m, tex: string) => {
    const token = `@@MATHI_${placeholders.length}@@`;
    placeholders.push({ token, html: texToHtml(tex, false) });
    return token;
  });
  return { placeholders, body };
}

export function restoreMath(html: string, placeholders: { token: string; html: string }[]): string {
  return placeholders.reduce((acc, p) => acc.split(p.token).join(`<span class="math">${p.html}</span>`), html);
}