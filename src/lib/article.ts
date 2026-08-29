// Article fetch + Zen organize (free OpenCode Zen models, fallback heuristic)
// Local-first: tries opencode zen local (http://localhost:4096), then cloud free, then heuristic

export type Organized = { front: string; back: string; tags: string };

// Fetch article HTML and extract title + text (no heavy deps, simple readability)
export async function fetchArticle(url: string): Promise<{ title: string; text: string; markdown: string }> {
  const u = url.trim();
  if (!u) throw new Error("URL required");

  // Try direct fetch (works in Tauri webview with CORS disabled via tauri http, fallback to proxy)
  const tryFetch = async (target: string) => {
    const res = await fetch(target, { headers: { Accept: "text/html" } });
    if (!res.ok) throw new Error(`Fetch ${res.status}`);
    return res.text();
  };

  let html = "";
  try {
    html = await tryFetch(u);
  } catch (e) {
    // CORS fallback: allorigins (free, no key)
    try {
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`;
      const r = await fetch(proxy);
      if (!r.ok) throw e;
      const j = await r.json();
      html = j.contents as string;
    } catch {
      throw e;
    }
  }

  // Very small readability: extract <title> and <article> or <main> or body text
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 120) : u;

  // Strip scripts/styles, then extract text
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);

  // Prefer article/main if present
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    clean = articleMatch[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
  }

  // Build markdown-ish
  const markdown = `# ${title}\n\n${clean.slice(0, 4000)}`;

  return { title, text: clean, markdown };
}

function heuristicOrganize(url: string, title: string, text: string): Organized {
  // Simple heuristic when Zen is unavailable: front = title question, back = link + summary + tags
  const firstSentences = text.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").slice(0, 400);
  const lower = (title + " " + text).toLowerCase();
  const tags: string[] = ["article", "reading"];
  if (lower.includes("dsa") || lower.includes("leetcode") || lower.includes("algorithm")) tags.push("dsa");
  if (lower.includes("system design") || lower.includes("scalab") || lower.includes("shard")) tags.push("sd-concepts");
  if (lower.includes("ai") || lower.includes("llm") || lower.includes("rag") || lower.includes("vector")) tags.push("ai-concepts");
  if (lower.includes("behavior") || lower.includes("leadership") || lower.includes("star")) tags.push("behavioral");
  if (tags.length === 2) tags.push("reading");

  const front = title.length > 80 ? `${title.slice(0, 77)}... — What’s the key takeaway?` : `${title} — What’s the key takeaway?`;
  const back = `**Link:** ${url}\n\n**Summary:** ${firstSentences || text.slice(0, 300)}\n\n**Takeaways:**\n- \n- \n\n**Tags:** ${tags.join(", ")}`;
  return { front, back, tags: tags.join(", ") };
}

async function callZen(prompt: string): Promise<string | null> {
  // 1) Local opencode zen (free, no key, if `opencode zen` running)
  try {
    const r = await fetch("http://localhost:4096/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "zen-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 600,
      }),
    });
    if (r.ok) {
      const j: any = await r.json();
      const c = j.choices?.[0]?.message?.content;
      if (c) return c as string;
    }
  } catch {}

  // 2) Cloud free opencode zen (no key, rate-limited)
  try {
    const r = await fetch("https://api.opencode.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "zen-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 600,
      }),
    });
    if (r.ok) {
      const j: any = await r.json();
      const c = j.choices?.[0]?.message?.content;
      if (c) return c as string;
    }
  } catch {}

  // 3) Check localStorage for custom endpoint/key (user can set)
  try {
    const endpoint = localStorage.getItem("revision_zen_endpoint");
    const key = localStorage.getItem("revision_zen_key");
    const model = localStorage.getItem("revision_zen_model") || "zen-mini";
    if (endpoint) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) headers["Authorization"] = `Bearer ${key}`;
      const r = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 600,
        }),
      });
      if (r.ok) {
        const j: any = await r.json();
        const c = j.choices?.[0]?.message?.content;
        if (c) return c as string;
      }
    }
  } catch {}

  return null;
}

export async function organizeArticle(url: string): Promise<Organized> {
  const { title, text, markdown } = await fetchArticle(url);

  const prompt = `You are Revision organizer for principal-level spaced repetition. Given ARTICLE (title + text) and URL, output ONLY JSON (no markdown, no extra text) with keys front, back, tags.

Requirements:
- front: question/prompt for active recall, ≤12 words, based on article core claim, e.g. "RAG — when to use hybrid search?"
- back: must start with "**Link:** ${url}" then "\\n\\n**Summary:** 2-3 bullets (each ≤20 words)" then "\\n\\n**Takeaways:** 2 bullets" then "\\n\\n**Tags:** ..." . Keep total back ≤120 words, markdown, no extra sections. Include Link as first line.
- tags: comma list, always include "article" plus 1-2 pillars: dsa, sd-concepts, sd-use-cases, ai-concepts, ai-use-cases, behavioral, plus 1 topic tag (e.g. rag, sharding). Lowercase, no spaces.

ARTICLE TITLE: ${title}
ARTICLE URL: ${url}
ARTICLE TEXT (truncated):
${markdown.slice(0, 3500)}

Output JSON example: {"front":"RAG — when to use hybrid search?","back":"**Link:** https://...\\n\\n**Summary:** - ...","tags":"article, ai-concepts, rag"}`;

  const raw = await callZen(prompt);
  if (raw) {
    // Try to extract JSON even if model adds extra text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const j = JSON.parse(jsonMatch[0]);
        if (j.front && j.back && j.tags) {
          // Ensure back starts with Link
          let back = String(j.back);
          if (!back.includes(url)) {
            back = `**Link:** ${url}\n\n${back}`;
          }
          // Ensure tags includes article
          let tags = String(j.tags).toLowerCase();
          if (!tags.includes("article")) tags = `article, ${tags}`;
          return { front: String(j.front).slice(0, 120), back: back.slice(0, 800), tags: tags.slice(0, 120) };
        }
      } catch {}
    }
  }

  // Fallback heuristic when Zen unavailable or parse failed
  return heuristicOrganize(url, title, text);
}
