export function renderMarkdown(text: string) {
  // Very small markdown renderer for cards: bold, italic, inline code, code block, lists, line breaks
  // Avoid heavy deps for bundle size
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let html = escapeHtml(text);

  // Code blocks ```lang\n code ```
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

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

  // Line breaks: double newline -> paragraph, single newline -> <br>
  html = html
    .split(/\n{2,}/)
    .map((para) => {
      if (para.startsWith("<h") || para.startsWith("<ul") || para.startsWith("<pre")) return para;
      // Don't wrap if already block
      const trimmed = para.trim();
      if (!trimmed) return "";
      return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");

  return html;
}

export function MarkdownView({ text }: { text: string }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}
