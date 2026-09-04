import { useMemo } from "react";
import { extractMath, restoreMath } from "./katex";

export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const re = /https?:\/\/[^\s<\)\"]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Trim trailing punctuation
    let u = m[0].replace(/[.,;!]+$/, "");
    if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

export type ClozeToken = { n: number; text: string; hint?: string };

/** Anki-style cloze: {{c1::answer}} or {{c1::answer::hint}} */
export function parseCloze(source: string): { tokens: ClozeToken[]; text: string } {
  const tokens: ClozeToken[] = [];
  const re = /\{\{c(\d+)::([^}]+?)(?:::(.+?))?\}\}/g;
  const text = source.replace(re, (_m, n: string, ans: string, hint?: string) => {
    tokens.push({ n: parseInt(n, 10), text: ans.trim(), hint: hint?.trim() });
    return "@@CLOZE@@";
  });
  return { tokens, text };
}

export function clozeCount(source: string): number {
  return parseCloze(source).tokens.length;
}

/**
 * Render markdown + math + (optionally) cloze blocks.
 * revealCloze: number of cloze blocks to reveal (front-based progressive reveal),
 * or null / "all" for everything revealed (back face).
 */
export function renderMarkdown(text: string, revealCloze: number | "all" | null = null) {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 1) cloze extraction (operates on raw source; placeholders bubble through escape)
  const { tokens, text: afterCloze } = parseCloze(text);
  const clozeCountN = tokens.length;

  // 2) math extraction (before markdown transforms)
  const { placeholders, body: withMath } = extractMath(afterCloze);

  // 3) escape
  let html = escapeHtml(withMath);

  // 4) restore math (already "safe" HTML from KaTeX)
  html = restoreMath(html, placeholders);

  // 5) code blocks: protect
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code}</code></pre>`);
    return `@@CODEBLOCK_${idx}@@`;
  });

  // inline code: protect
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${code}</code>`);
    return `@@INLINECODE_${idx}@@`;
  });

  // 6) links
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/(?<!href=")(https?:\/\/[^\s<\)\"]+)/g, (url) => {
    const clean = url.replace(/[.,;!]+$/, "");
    const trail = url.slice(clean.length);
    return `<a href="${clean}" class="md-link" target="_blank" rel="noopener noreferrer">${clean}</a>${trail}`;
  });

  // 7) inline style
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/(?<!_) _([^_]+)_(?!_)/g, "<em>$1</em>");

  // 8) headers + lists
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/^\s*-\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);

  // 9) restore code + math is already inline
  html = html.replace(/@@INLINECODE_(\d+)@@/g, (_m, idx) => inlineCodes[Number(idx)]);
  html = html.replace(/@@CODEBLOCK_(\d+)@@/g, (_m, idx) => codeBlocks[Number(idx)]);

  // 10) paragraphs
  html = html
    .split(/\n{2,}/)
    .map((para) => {
      if (/^(<h[1-6]|<ul|<pre|<div class="math)/.test(para.trim())) return para;
      const trimmed = para.trim();
      if (!trimmed) return "";
      return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");

  // 11) cloze mask / reveal
  if (clozeCountN > 0) {
    const revealedCount = revealCloze === "all" ? Infinity : Number(revealCloze ?? 0);
    let idx = -1;
    html = html.replace(/@@CLOZE@@/g, () => {
      idx += 1;
      const t = tokens[idx];
      const isRevealed = idx < revealedCount;
      return renderClozeBlock(t, isRevealed);
    });
  } else {
    html = html.split("@@CLOZE@@").join("");
  }

  return html;
}

function renderClozeBlock(t: ClozeToken, revealed: boolean): string {
  if (revealed) {
    const hintAttr = t.hint ? ` title="hint: ${t.hint}"` : "";
    return `<span class="cloze revealed"${hintAttr}><mark>${escapeInner(t.text)}</mark></span>`;
  }
  const words = t.text.split(/\s+/).filter(Boolean);
  const chips = words
    .map((w) => `<span class="cloze-mask" style="width:${clampChip(w)}ch"></span>`)
    .join("");
  const hint = t.hint ? `<span class="cloze-hint">${escapeInner(t.hint)}</span>` : "";
  return `<span class="cloze block">${chips}${hint}</span>`;
}

function escapeInner(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clampChip(w: string): number {
  return Math.min(14, Math.max(2, w.length * 0.68));
}

export function MarkdownView({ text, revealCloze = null, className }: { text: string; revealCloze?: number | "all" | null; className?: string }) {
  const html = useMemo(() => renderMarkdown(text, revealCloze), [text, revealCloze]);
  const handleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a.md-link") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || !href.startsWith("http")) return;
    e.preventDefault();
    try {
      const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
      if (isTauri) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(href);
      } else {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };
  return <div className={`md ${className ?? ""}`} onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />;
}