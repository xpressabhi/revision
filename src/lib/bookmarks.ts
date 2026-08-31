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
  if (lower.includes("system design") || lower.includes("design") && lower.includes("system")) {
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

// Parse Chrome Bookmarks JSON (Default/Bookmarks)
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
      } else if (typeof node === "object") {
        for (const key of Object.keys(node)) {
          const val = node[key];
          if (val && typeof val === "object") walk(val, folderPath);
        }
      }
    };
    walk(roots, "");
    // Also handle direct roots.bookmark_bar etc. if not caught
    for (const key of ["bookmark_bar", "other", "synced"]) {
      if (roots[key]) walk(roots[key], roots[key].name || key);
    }
  } catch {}
  // Deduplicate by url (keep first)
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

// Parse Chrome exported Bookmarks.html
export function parseBookmarksHtml(html: string): BookmarkRaw[] {
  const out: BookmarkRaw[] = [];
  const re = /<(H3[^>]*>([^<]+)<\/H3>|A\s+HREF="([^"]+)"[^>]*>([^<]+)<\/A)/gi;
  let m: RegExpExecArray | null;
  let currentFolder = "";
  while ((m = re.exec(html)) !== null) {
    if (m[2]) {
      // H3 folder
      currentFolder = m[2].trim();
      // Keep stack simple: last H3 is current folder
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

export async function readChromeBookmarksFile(): Promise<string> {
  // Try Default and Profile * Bookmarks paths via Tauri fs
  // Note: macOS TCC may block direct read without Full Disk Access — caller should fallback to dialog
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const { homeDir, join } = await import("@tauri-apps/api/path");
  const home = await homeDir();
  const candidates = [
    await join(home, "Library/Application Support/Google/Chrome/Default/Bookmarks"),
    await join(home, "Library/Application Support/Google/Chrome/Profile 1/Bookmarks"),
    await join(home, "Library/Application Support/Google/Chrome/Profile 2/Bookmarks"),
    await join(home, "Library/Application Support/Google/Chrome/Profile 3/Bookmarks"),
  ];
  let lastErr: any = null;
  for (const p of candidates) {
    try {
      const text = await readTextFile(p);
      if (text && text.length > 100) return text;
    } catch (e) {
      lastErr = e;
    }
  }
  // Surface permission hint — most common on macOS 14+ is Operation not permitted without Full Disk Access
  const msg = String(lastErr ?? "");
  if (msg.includes("not permitted") || msg.includes("Operation not permitted") || msg.includes("permission")) {
    throw new Error(`Permission denied reading Chrome Bookmarks (macOS blocks it). Use “Import HTML/JSON” and pick the file via dialog which grants access. Tried: ${candidates[0]} — ${msg.slice(0,120)}`);
  }
  throw lastErr || new Error(`Chrome Bookmarks not found. Tried: ${candidates.join(", ")}`);
}

export async function chromeBookmarksExists(): Promise<boolean> {
  // Check if Chrome bookmarks file exists at any known location without reading content.
  // Returns true if file exists OR if macOS blocks with “not permitted” (implies file exists but TCC blocks read).
  // Used to decide whether to show direct “Import Bookmarks” button at all.
  try {
    const { exists } = await import("@tauri-apps/plugin-fs");
    const { homeDir, join } = await import("@tauri-apps/api/path");
    const home = await homeDir();
    const candidates = [
      await join(home, "Library/Application Support/Google/Chrome/Default/Bookmarks"),
      await join(home, "Library/Application Support/Google/Chrome/Profile 1/Bookmarks"),
      await join(home, "Library/Application Support/Google/Chrome/Profile 2/Bookmarks"),
      await join(home, "Library/Application Support/Google/Chrome/Profile 3/Bookmarks"),
      // Linux
      await join(home, ".config/google-chrome/Default/Bookmarks"),
      await join(home, ".config/google-chrome/Profile 1/Bookmarks"),
      // Windows (homeDir is C:\Users\name)
      await join(home, "AppData/Local/Google/Chrome/User Data/Default/Bookmarks"),
      await join(home, "AppData/Local/Google/Chrome/User Data/Profile 1/Bookmarks"),
    ];
    for (const p of candidates) {
      try {
        if (await exists(p)) return true;
      } catch (e: any) {
        const m = String(e ?? "");
        // “not permitted” means file exists but we’re blocked — treat as found for UI purposes (picker will handle)
        if (m.includes("not permitted") || m.includes("Permission denied")) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function pickAndReadBookmarksViaDialog(): Promise<string> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const { homeDir, join } = await import("@tauri-apps/api/path");
  // Try to open directly in Chrome's Default folder so user sees the raw Bookmarks file (no picker navigation needed)
  // Even without Full Disk Access, the picker itself is Powerbox-granted and can show the folder
  let defaultPath: string | undefined = undefined;
  try {
    const home = await homeDir();
    // Prefer macOS, then Linux, then Windows — first one that exists will be used as start folder
    // We don't check exists here (would be blocked); just propose the most likely macOS path
    defaultPath = await join(home, "Library/Application Support/Google/Chrome/Default");
  } catch {}
  // Filters: HTML export + JSON + raw Bookmarks (no ext → needs All files)
  const selected = await open({
    multiple: false,
    directory: false,
    defaultPath,
    title: "Select Chrome Bookmarks file (Default/Bookmarks, no extension) or exported Bookmarks.html",
    filters: [
      { name: "All files", extensions: ["*"] },
      { name: "Bookmarks HTML/JSON", extensions: ["html", "htm", "json"] },
    ],
  });
  if (!selected || Array.isArray(selected)) {
    if (Array.isArray(selected) && selected[0]) {
      const t = await readTextFile(selected[0] as string);
      if (t && t.length > 50) return t;
    }
    throw new Error("No file selected");
  }
  const path = selected as string;
  const text = await readTextFile(path);
  if (!text || text.length < 50) throw new Error("File empty or unreadable");
  return text;
}
