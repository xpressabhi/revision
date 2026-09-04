// Article fetch + Zen organize (free OpenCode Zen models, fallback heuristic)
// Local-first: tries opencode zen local (http://localhost:4096), then cloud free, then heuristic

export type Organized = { front: string; back: string; tags: string };

let cachedFreeModels: string[] | null = null;

export async function fetchFreeModels(): Promise<string[]> {
  if (cachedFreeModels) return cachedFreeModels;
  try {
    const r = await fetch("https://opencode.ai/zen/v1/models");
    if (!r.ok) throw new Error(`models ${r.status}`);
    const j: any = await r.json();
    const data: any[] = j.data || j.models || [];
    const ids: string[] = data.map((m: any) => m.id as string).filter((id: string) => id.includes("free"));
    if (ids.length === 0) throw new Error("no free models");
    // Keep original order from API (already sorted), first is default
    cachedFreeModels = ids;
    return ids;
  } catch (e) {
    // Fallback hardcoded free list (known to work, from /models)
    const fallback = [
      "nemotron-3.5-lightning-free",
      "mimo-v2.5-free",
      "deepseek-v4-flash-free",
      "muse-spark-1.2-contributor-free",
      "hy3-free",
      "ling-3.0-flash-fin-free",
      "laguna-s-2.1-free",
      "nemotron-3-ultra-free",
    ];
    cachedFreeModels = fallback;
    return fallback;
  }
}

export function getSelectedZenModel(): string {
  try {
    const m = localStorage.getItem("revision_zen_model");
    if (m) return m;
  } catch {}
  return "";
}

export function setSelectedZenModel(model: string) {
  try {
    localStorage.setItem("revision_zen_model", model);
  } catch {}
}

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
    // CORS fallbacks: try allorigins (json + raw), corsproxy, and firecrawl if key available
    const fallbacks: (() => Promise<string>)[] = [
      async () => {
        const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`;
        const r = await fetch(proxy);
        if (!r.ok) throw new Error("allorigins/get failed");
        const j: any = await r.json();
        if (!j.contents) throw new Error("allorigins empty");
        return j.contents as string;
      },
      async () => {
        const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`;
        const r = await fetch(proxy);
        if (!r.ok) throw new Error("allorigins/raw failed");
        return r.text();
      },
      async () => {
        const proxy = `https://corsproxy.io/?${encodeURIComponent(u)}`;
        const r = await fetch(proxy);
        if (!r.ok) throw new Error("corsproxy failed");
        const t = await r.text();
        if (!t || t.length < 500) throw new Error("corsproxy empty");
        return t;
      },
      async () => {
        // Firecrawl if key in localStorage (best for Medium paywall + JS)
        const key = (() => {
          try { return localStorage.getItem("revision_firecrawl_key") || ""; } catch { return ""; }
        })();
        if (!key) throw new Error("no firecrawl key");
        const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ url: u, onlyMainContent: true, waitFor: 5000 }),
        });
        if (!r.ok) throw new Error("firecrawl failed");
        const j: any = await r.json();
        return (j.data?.markdown || j.data?.html || j.markdown || "") as string;
      },
    ];
    let lastErr = e;
    for (const fn of fallbacks) {
      try {
        html = await fn();
        if (html && html.length > 500) break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!html) {
      // Final fallback: return minimal stub for Zen to still try (e.g., Medium behind Cloudflare without Firecrawl key)
      // Use URL as title and placeholder text so organizeArticle can still create a card via heuristic/Zen
      const fallbackTitle = u.split("/").pop()?.replace(/-/g, " ").replace(/\?.*/, "") || u;
      console.warn("All article fetches failed, using fallback stub for", u, lastErr);
      return { title: fallbackTitle.slice(0, 120) || u, text: `Article at ${u}: fetch blocked (Cloudflare). Use Firecrawl API key in Settings for full extract.`, markdown: `# ${fallbackTitle}\n\nArticle at ${u}` };
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

  const front = title.length > 80 ? `${title.slice(0, 77)}...: What is the key takeaway?` : `${title}: What is the key takeaway?`;
  const back = `**Link:** ${url}\n\n**Summary:** ${firstSentences || text.slice(0, 300)}\n\n**Takeaways:**\n- \n- \n\n**Tags:** ${tags.join(", ")}`;
  return { front, back, tags: tags.join(", ") };
}

async function callZen(prompt: string): Promise<string | null> {
  // 1) Primary: opencode.ai/zen/v1 — try all free models in order, selected first
  try {
    const freeList = await fetchFreeModels();
    const selected = getSelectedZenModel();
    const ordered = selected && freeList.includes(selected)
      ? [selected, ...freeList.filter((m) => m !== selected)]
      : freeList;
    for (const model of ordered) {
      try {
        const r = await fetch("https://opencode.ai/zen/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_tokens: 1200,
          }),
        });
        if (r.ok) {
          const j: any = await r.json();
          const c = j.choices?.[0]?.message?.content ?? j.choices?.[0]?.text;
          if (c && c.trim()) return c as string;
        } else {
          // If 403/429, try next model
          const txt = await r.text().catch(() => "");
          if (r.status === 429 || r.status === 403 || txt.includes("FreeUsageLimit") || txt.includes("Rate limit") || txt.includes("unavailable")) {
            continue;
          }
        }
      } catch {}
    }
  } catch {}

  // 2) Fallback: try local zen if user runs `opencode zen`
  try {
    const localModel = getSelectedZenModel() || "muse-spark-free";
    const r = await fetch("http://localhost:4096/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: localModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 1200,
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
    const model = localStorage.getItem("revision_zen_model") || "nemotron-3.5-lightning-free";
    if (endpoint) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) headers["Authorization"] = `Bearer ${key}`;
      const r = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 1200,
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
          // Ensure tags includes article — handle both string and array
          const tagsRaw = Array.isArray(j.tags) ? (j.tags as string[]).join(", ") : String(j.tags);
          let tags = tagsRaw.toLowerCase();
          if (!tags.includes("article")) tags = `article, ${tags}`;
          // Normalize tags to our pillar format
          tags = tags.replace(/\s+/g, " ").replace(/,\s*/g, ", ").trim();
          return { front: String(j.front).slice(0, 120), back: back.slice(0, 800), tags: tags.slice(0, 150) };
        }
      } catch {}
    }
    // Zen returned something but not valid JSON — treat as failed and try heuristic, but warn
    console.warn("Zen returned invalid JSON, falling back to heuristic", raw.slice(0, 300));
  }

  // Fallback heuristic when Zen unavailable or parse failed — still return heuristic so card can be created
  // If raw was null (all free models failed), the heuristic will be used but UI can show a warning toast
  // We attach a console warning for debugging; handleOrganizeArticle will show a toast about switching model
  if (!raw) {
    const freeModels = await fetchFreeModels().catch(() => []);
    if (freeModels.length > 0) {
      console.warn(`All free Zen models failed (tried ${freeModels.slice(0, 3).join(", ")}...). Using heuristic. Please switch model in Settings → Zen Model.`);
      // Optionally, we could throw to let UI show error, but we return heuristic so card is still created
      // The UI will detect heuristic (back contains "fetch blocked" or front is generic) and show a toast
    }
  }
  return heuristicOrganize(url, title, text);
}
