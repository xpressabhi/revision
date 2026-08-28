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

export function renderMarkdown(text: string) {
  // Very small markdown renderer for cards: bold, italic, inline code, code block, lists, line breaks, links
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let html = escapeHtml(text);

  // Code blocks ```lang\n code ``` — protect from link processing
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code}</code></pre>`);
    return `@@CODEBLOCK_${idx}@@`;
  });

  // Inline code `code` — protect
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${code}</code>`);
    return `@@INLINECODE_${idx}@@`;
  });

  // Markdown links [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener noreferrer">$1</a>');

  // Bare URLs — not already in href="..."
  html = html.replace(/(?<!href=")(https?:\/\/[^\s<\)\"]+)/g, (url) => {
    const clean = url.replace(/[.,;!]+$/, "");
    const trail = url.slice(clean.length);
    return `<a href="${clean}" class="md-link" target="_blank" rel="noopener noreferrer">${clean}</a>${trail}`;
  });

  // Bold **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // Italic *text* or _text_ (avoid conflicting with bold)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/(?<!_) _([^_]+)_(?!_)/g, "<em>$1</em>");

  // Headers # ## ###
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Lists: - item
  html = html.replace(/^\s*-\s+(.+)$/gm, "<li>$1</li>");
  // Wrap consecutive li
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);

  // Restore inline codes and code blocks
  html = html.replace(/@@INLINECODE_(\d+)@@/g, (_m, idx) => inlineCodes[Number(idx)]);
  html = html.replace(/@@CODEBLOCK_(\d+)@@/g, (_m, idx) => codeBlocks[Number(idx)]);

  // Line breaks: double newline -> paragraph, single newline -> <br>
  html = html
    .split(/\n{2,}/)
    .map((para) => {
      if (para.startsWith("<h") || para.startsWith("<ul") || para.startsWith("<pre")) return para;
      const trimmed = para.trim();
      if (!trimmed) return "";
      return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");

  return html;
}

export function MarkdownView({ text }: { text: string }) {
  const handleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a.md-link") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || !href.startsWith("http")) return;
    e.preventDefault();
    try {
      // Prefer Tauri opener, fallback to window.open
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

  return <div className="md" onClick={handleClick} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}
