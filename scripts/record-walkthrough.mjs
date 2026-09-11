// Records docs/media/walkthrough.mp4 — a silent, captioned tour of the web app
// starting from a fresh first-run (setup guide), using Playwright's video capture.
//
// Run:  npm i -D playwright   # one-time, local only
//       node scripts/record-walkthrough.mjs
//
// Requires ffmpeg on PATH for the .mp4 step; without it the .webm is kept.

import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_URL = "http://localhost:1420";
const TMP = path.join(os.tmpdir(), `revision-walkthrough-${Date.now()}`);
const RAW_DIR = path.join(TMP, "raw");
const SYNC_FILE = path.join(TMP, "demo-sync.json");
const OUT_DIR = path.join(ROOT, "docs", "media");
const OUT_MP4 = path.join(OUT_DIR, "walkthrough.mp4");
const OUT_WEBM = path.join(OUT_DIR, "walkthrough.webm");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function serverUp() {
  try {
    const res = await fetch(APP_URL);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverUp()) return null;
  const child = spawn("npm", ["run", "dev"], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    if (await serverUp()) return child;
  }
  throw new Error("dev server did not start on " + APP_URL);
}

function writeSyncFile() {
  const now = new Date().toISOString();
  const mk = (n) => ({
    uid: `walkthrough-${n}`,
    front: n === 1 ? "What does FSRS stand for?" : "Sync works through what?",
    back: n === 1 ? "Free Spaced Repetition Scheduler." : "One JSON file both apps attach.",
    tags: "walkthrough",
    created_at: now,
    updated_at: now,
    deleted_at: null,
    due_at: now,
    interval: 0,
    ease: 2.5,
    reps: 0,
    state: "new",
    stability: 0,
    difficulty: 5,
    state_updated_at: now,
  });
  const file = {
    kind: "revision-sync",
    version: 2,
    exported_at: now,
    device_id: "walkthrough-demo",
    device_name: "Demo",
    cards: [mk(1), mk(2)],
    reviews: [],
  };
  mkdirSync(TMP, { recursive: true });
  writeFileSync(SYNC_FILE, JSON.stringify(file));
}

const DEMO_OVERLAY = () => {
  const ensure = () => {
    if (document.getElementById("__demo_caption")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__demo_caption { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); max-width: 1020px;
        padding: 12px 18px; border-radius: 12px; background: rgba(8,10,12,.88); color: #fff;
        font: 600 16.5px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: .01em;
        box-shadow: 0 12px 34px rgba(0,0,0,.4); opacity: 0; transition: opacity .25s ease; z-index: 99999;
        text-align: center; pointer-events: none; }
      #__demo_caption.on { opacity: 1; }
      #__demo_cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 100000;
        pointer-events: none; transition: transform .5s cubic-bezier(.2,.7,.2,1);
        filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
    `;
    document.documentElement.appendChild(style);
    const cap = document.createElement("div");
    cap.id = "__demo_caption";
    document.documentElement.appendChild(cap);
    const cur = document.createElement("div");
    cur.id = "__demo_cursor";
    cur.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-2 6z" fill="#fff" stroke="#111" stroke-width="1.4"/></svg>`;
    document.documentElement.appendChild(cur);
    window.__caption = (t) => {
      cap.textContent = t;
      cap.classList.remove("on");
      void cap.offsetWidth;
      cap.classList.add("on");
    };
    window.__cursor = (x, y) => {
      cur.style.transform = `translate(${x}px, ${y}px)`;
    };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensure);
  else ensure();
};

async function main() {
  const devServer = await ensureServer();
  writeSyncFile();

  const { chromium } = await import("playwright");
  rmSync(RAW_DIR, { recursive: true, force: true });
  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    recordVideo: { dir: RAW_DIR, size: { width: 1280, height: 720 } },
  });
  await context.addInitScript(DEMO_OVERLAY);
  const page = await context.newPage();

  const caption = async (text, hold = 1700) => {
    await page.evaluate((t) => window.__caption(t), text);
    await sleep(hold);
  };
  const moveTo = async (locator) => {
    const box = await locator.boundingBox();
    if (box) {
      await page.evaluate(([x, y]) => window.__cursor(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
      await sleep(420);
    }
  };
  const click = async (locator) => {
    await moveTo(locator);
    await locator.click();
  };

  console.log("recording…");
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.locator(".guide-modal").waitFor({ timeout: 25000 });
  await caption("First launch: Revision walks you through setup in four steps.", 2600);

  // Step 1 — the review loop
  await click(page.getByRole("button", { name: "Start first review", exact: true }));
  await page.keyboard.press("Space");
  await caption("Space or a click flips the card — the answer side shows FSRS intervals.", 2600);
  await page.keyboard.press("3");
  await caption("Press 1–4 to grade (or drag the card). Revision schedules the next review.", 2400);

  // back to the study home
  await click(page.getByRole("button", { name: "Study", exact: true }).first());
  await page.locator(".kpi-row").waitFor({ timeout: 8000 });

  // Step 2 — add a card
  await click(page.getByRole("button", { name: "New card", exact: true }).first());
  await page.locator('.modal[aria-label="New card"]').waitFor({ timeout: 8000 });
  await page.locator("textarea").first().fill("What is Revision?");
  await click(page.getByRole("button", { name: "Back", exact: true }).first());
  await page.locator("textarea").first().fill("A local-first spaced-repetition app for interview prep.");
  await caption("Add cards by hand, or import CSV, Chrome bookmarks, pasted text — Anki on desktop.", 2200);
  await click(page.getByRole("button", { name: "Save", exact: true }));
  await page.keyboard.press("Escape");

  // Step 3 — settings
  await click(page.locator("button[title^='Settings']").first());
  await caption("Tune target retention (80–95%) and daily new/review limits.", 2200);
  await click(page.getByRole("button", { name: "Data", exact: true }));
  await page.locator("#sync-panel").scrollIntoViewIfNeeded();
  await caption("Then pair web and desktop through one JSON file you control.", 2200);

  // Step 4 — a real merge
  await moveTo(page.getByRole("button", { name: "Import / merge sync file", exact: true }));
  await page.setInputFiles("#sync-panel input[type=file]", SYNC_FILE);
  await page.getByText("Merged:").waitFor({ timeout: 10000 });
  await caption("Sync now merges both ways: newest edit wins, review history combines.", 2800);

  // Close — study home with the checklist
  await click(page.getByRole("button", { name: "Study", exact: true }).first());
  await caption("That's it. Your cards live in this browser and the desktop app.", 2600);
  await caption("Download: github.com/xpressabhi/revision/releases", 2600);

  const video = page.video();
  await context.close();
  await browser.close();
  if (devServer) devServer.kill();

  const raw = await video.path();
  const src = existsSync(raw) ? raw : readdirSync(RAW_DIR).map((f) => path.join(RAW_DIR, f))[0];
  console.log("raw video:", src);

  let out = OUT_WEBM;
  try {
    execFileSync("ffmpeg", ["-y", "-i", src, "-c:v", "libx264", "-preset", "medium", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT_MP4], { stdio: "inherit" });
    out = OUT_MP4;
    rmSync(OUT_WEBM, { force: true });
  } catch {
    copyFileSync(src, OUT_WEBM);
    out = OUT_WEBM;
    console.warn("ffmpeg unavailable — kept .webm");
  }
  console.log("wrote", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
