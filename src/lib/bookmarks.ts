export type BookmarkRaw = { title: string; url: string; folderPath: string; dateAdded?: string };
export type BookmarkDraft = { title: string; url: string; folderPath: string; tags: string; reason?: string; checked: boolean };

function folderToTag(folder: string): string {
  const lower = folder.toLowerCase();
  if (lower.includes("dsa") || lower.includes("leetcode")) return "dsa";
  if (lower.includes("system design") && lower.includes("concepts")) return "sd-concepts";
  if (lower.includes("system design") && lower.includes("use")) return "sd-use-cases";
  if (lower.includes("system design")) return "sd-concepts";
  if (lower.includes("ai") && lower.includes("concepts")) return "ai-concepts";
  if (lower.includes("ai") && lower.includes("use")) return "ai-use-cases";
  if (lower.includes("ai")) return "ai-concepts";
  if (lower.includes("behavior")) return "behavioral";
  if (lower.includes("reading") || lower.includes("article")) return "article";
  return "";
}

function heuristicTags(url: string, folderPath: string, title: string): string {
  const parts: string[] = ["bookmark", "reading"];
  const ft = folderToTag(folderPath);
  if (ft) parts.push(ft);
  const lower = (url + " " + title).toLowerCase();
  if (lower.includes("leetcode") || lower.includes("dsa") || lower.includes("algorithm")) {
    if (!parts.includes("dsa")) parts.push("dsa");
  }
  if (lower.includes("system design") || (lower.includes("design") && lower.includes("system"))) {
    if (!parts.some((p) => p.startsWith("sd-"))) parts.push("sd-concepts");
  }
  if (lower.includes("ai") || lower.includes("llm") || lower.includes("rag") || lower.includes("vector") || lower.includes("agentic")) {
    if (!parts.includes("ai-concepts")) parts.push("ai-concepts");
  }
  if (lower.includes("medium.com")) parts.push("article");
  return Array.from(new Set(parts)).join(", ");
}

function isIgnoredUrl(url: string): string | null {
  if (!url) return "empty url";
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("edge://") || url.startsWith("about:")) return "chrome internal";
  if (url.startsWith("javascript:") || url.startsWith("data:") || url.startsWith("file://")) return "invalid scheme";
  if (url.length < 8) return "invalid url";
  return null;
}

export function parseChromeBookmarksJson(jsonText: string): BookmarkRaw[] {
  const out: BookmarkRaw[] = [];
  try {
    const data = JSON.parse(jsonText);
    const roots = data.roots || {};
    const walk = (node: any, folderPath: string) => {
      if (!node) return;
      if (node.type === "url" && node.url) {
        out.push({ title: node.name || node.url, url: node.url, folderPath, dateAdded: node.date_added });
      } else if (node.children && Array.isArray(node.children)) {
        const nextPath = node.name ? (folderPath ? `${folderPath}/${node.name}` : node.name) : folderPath;
        for (const child of node.children) walk(child, nextPath);
      }
    };
    walk(roots, "");
    for (const key of ["bookmark_bar", "other", "synced"]) {
      if (roots[key]) walk(roots[key], roots[key].name || key);
    }
  } catch {}
  const seen = new Set<string>();
  const dedup: BookmarkRaw[] = [];
  for (const b of out) {
    if (!seen.has(b.url)) {
      seen.add(b.url);
      dedup.push(b);
    }
  }
  return dedup;
}

export function parseBookmarksHtml(html: string): BookmarkRaw[] {
  const out: BookmarkRaw[] = [];
  const re = /<(H3[^>]*>([^<]+)<\/H3>|A\s+HREF="([^"]+)"[^>]*>([^<]+)<\/A)/gi;
  let m: RegExpExecArray | null;
  let currentFolder = "";
  while ((m = re.exec(html)) !== null) {
    if (m[2]) {
      currentFolder = m[2].trim();
    } else if (m[3]) {
      const url = m[3];
      const title = (m[4] || url).trim();
      out.push({ title, url, folderPath: currentFolder });
    }
  }
  return out;
}

export function toDrafts(raw: BookmarkRaw[], existingUrls: Set<string>, existingFronts: Set<string>): { willAdd: BookmarkDraft[]; ignored: (BookmarkDraft & { reason: string })[] } {
  const willAdd: BookmarkDraft[] = [];
  const ignored: (BookmarkDraft & { reason: string })[] = [];
  for (const r of raw) {
    const ignoreReason = isIgnoredUrl(r.url);
    if (ignoreReason) {
      ignored.push({ title: r.title, url: r.url, folderPath: r.folderPath, tags: "", checked: false, reason: `ignored: ${ignoreReason}` });
      continue;
    }
    const lowerUrl = r.url.toLowerCase();
    const dupUrl = Array.from(existingUrls).some((u) => u.toLowerCase() === lowerUrl);
    const dupFront = existingFronts.has(r.title.trim());
    if (dupUrl || dupFront) {
      ignored.push({ title: r.title, url: r.url, folderPath: r.folderPath, tags: heuristicTags(r.url, r.folderPath, r.title), checked: false, reason: dupUrl ? "duplicate: already in Revision (url)" : "duplicate: same title" });
      continue;
    }
    willAdd.push({
      title: r.title.slice(0, 120),
      url: r.url,
      folderPath: r.folderPath,
      tags: heuristicTags(r.url, r.folderPath, r.title),
      checked: true,
    });
  }
  return { willAdd, ignored };
}
