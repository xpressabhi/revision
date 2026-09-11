// Clutter budget audit: counts visible chrome controls per view (headers,
// toolbars, menus — not data rows) and reports against the UX budgets.
// Run after `npm run dev` (or it starts one).
//
//   npm i -D playwright   # one-time, local only
//   node scripts/ux-audit.mjs
//
// Budgets are intentionally small; if a view exceeds one, look for something
// that belongs at level 2 (a ··· menu, Settings, or the `?` overlay).

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_URL = "http://localhost:1420";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_SELECTORS = ".page-head, .browse-toolbar, .settings-tabs, .getstarted-banner, .exam-plan-row, .bulk-bar";

const VIEWS = [
  { name: "Study", nav: (page) => page.locator(".sb-item", { hasText: "Study" }).first().click(), budget: 6 },
  { name: "Browse", nav: (page) => page.keyboard.press("Meta+2"), budget: 8 },
  { name: "Progress", nav: (page) => page.locator(".sb-item", { hasText: "Progress" }).first().click(), budget: 3 },
  { name: "Settings", nav: (page) => page.locator("button[title^='Settings']").click(), budget: 6 },
  { name: "Review", nav: null, budget: 9 },
];

async function serverUp() {
  try {
    return (await fetch(APP_URL)).ok;
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
  throw new Error("dev server did not start");
}

const countControls = (scopeSelector) => {
  const seen = new Set();
  for (const scopeEl of document.querySelectorAll(scopeSelector)) {
    for (const c of scopeEl.querySelectorAll("button, a, input, select, textarea")) {
      if (c.getClientRects().length > 0) seen.add(c);
    }
  }
  return seen.size;
};

async function main() {
  const devServer = await ensureServer();
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() =>
    localStorage.setItem("recall_getstarted_v1", JSON.stringify({ seen: true, hidden: true, done: [], dismissedAt: null, completedAt: null }))
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".kpi-row").waitFor({ timeout: 20000 });
  await sleep(400);

  const results = [];
  for (const view of VIEWS) {
    if (view.name === "Review") {
      await page.locator(".sb-item", { hasText: "Start Review" }).first().click();
      await page.locator(".review-stage").waitFor({ timeout: 8000 });
      await sleep(300);
      results.push({ ...view, count: await page.evaluate(countControls, ".review-stage") });
      await page.getByRole("button", { name: "End", exact: true }).click();
      await sleep(400);
      continue;
    }
    await view.nav(page);
    await sleep(500);
    results.push({ ...view, count: await page.evaluate(countControls, CHROME_SELECTORS) });
  }

  await context.close();
  await browser.close();
  if (devServer) devServer.kill();

  let failures = 0;
  console.log("\nClutter budget audit (visible chrome controls per view)\n");
  for (const r of results) {
    const ok = r.count <= r.budget;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${r.name.padEnd(9)} ${String(r.count).padStart(3)} controls  (budget ${r.budget})`);
  }
  console.log(`\n${results.length - failures}/${results.length} views within budget`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
