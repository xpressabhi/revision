# Revision — Development

For agent maintenance details (release checklist, gesture architecture, gotchas) see [AGENTS.md](../AGENTS.md). For daily usage see [USER_GUIDE.md](USER_GUIDE.md).

## Stack

- **tinyjs** desktop shell + **React 19** + **TypeScript** + **Vite 7** + **KaTeX**
- Backend (`backend/`, txiki.js — esbuild-bundled by the tinyjs CLI): SQLite (`tjs:sqlite`), file I/O for sync, Anki extraction (`fflate` + `fzstd`), tray, global shortcut. Plain JS/TS with npm packages allowed — **no Node builtins, no native modules**
- Frontend DB abstraction: `src/lib/db.ts` — picks the tinyjs bridge driver (`src/lib/db/tinyjs.ts`) under the desktop shell, otherwise the Dexie/IndexedDB driver (`src/lib/db/idb.ts`)
- Sync: `src/lib/sync.ts` (pure merge) + `src/lib/syncFile.ts` (file I/O: desktop backend calls vs browser File System Access / download)
- Styling: custom design system in `src/App.css` (CSS variables, 4 themes, 3 density scalars, reduced-motion support)

## Run & build

From repo root `revision/`:

```bash
npm install
# Desktop (tinyjs) — Vite dev server + native window, frontend HMR
npm run desktop:dev

# Or preview in browser only (IndexedDB, no tinyjs needed)
npm run dev                    # http://127.0.0.1:1420

# Package the desktop app
npm run desktop:build          # dist/Revision.app + dist/revision-<ver>.dmg (ad-hoc signed)
npm run desktop:install        # build + copy .app to /Applications + launch

# Web build only -> dist/ (same output Vercel deploys)
npm run build
```

Requires the [tinyjs CLI](https://tinyjs.app) (`curl -fsSL https://tinyjs.app/install | sh`) and Node for Vite. No Rust toolchain. Desktop builds run natively per OS — macOS builds are made on macOS, Windows on Windows, Linux on Linux (glibc ≤ 2.35 floor: build Linux artifacts on Ubuntu 22.04).

Dev notes:

- `tinyjs dev` spawns `npm run dev` (Vite) and opens the native window at `127.0.0.1:1420`. Frontend edits hot-reload; devtools via F12.
- Backend (`backend/`) edits are **not** watched by tinyjs 0.42.3 — restart `tinyjs dev` (or touch any `src/` file, which restarts the backend) after changing it.
- The desktop app uses the same `revision.db` location the Tauri builds used (`~/Library/Application Support/com.revision.app/` on macOS, `%APPDATA%\com.revision.app` on Windows). On Linux, the first tinyjs run copies the DB from the old `~/.config/com.revision.app` to `~/.local/share/com.revision.app` once.
- The `tiny` global (bridge + typings in `src/types/tiny.d.ts`) exists only in the desktop shell; browser builds must keep working through the `src/lib/platform.ts` guards.

**Verification:** `npm test` (Vitest — `fsrs`, `derive`, `csv`, `markdown`, `session`, `backup`, `sync`, the IndexedDB adapter via `fake-indexeddb`, plus the backend's SQL placeholder translation and Anki archive extraction with fixtures) and `npm run build` (tsc strict + vite). There are no component/DOM tests yet; use the dev server + browser tooling for manual checks.

## Project layout

```
revision/
  backend/                  # tinyjs backend (txiki.js; esbuild-bundled by the CLI)
    main.ts                 #   api (db/fs/anki/tray), bootstrap, hotkey + tray hooks
    sql.ts                  #   `$n` → `?n` translation, param normalization, run/query helpers
    anki.ts, anki-archive.ts#   Anki staging (fflate + fzstd) + staged-db handle
    fixtures/               #   tiny binary fixtures for archive tests
  tinyjs.json               # tinyjs app config (id, size, chrome, frontend/backend wiring)
  icon.png                  # 1024×1024 app icon
  src/
    App.tsx                 # shell: 3-pane layout, keyboard master, review state machine
    App.css                 # design system: tokens (4 themes), components, motion
    types/                  # tiny.d.ts / tjs.d.ts (ambient typings for the bridge)
    components/             # Sidebar, CommandBar, Inspector, Dashboard, ReviewView,
                            # EditorModal, BrowseView, AnalyticsView, SettingsView,
                            # QuickCapture, ImportModal, SyncPanel, Toast, ui
    lib/
      fsrs.ts               # FSRS-5 scheduler + interval/retrievability predictions
      db.ts                 # repository facade: tinyjs bridge or Dexie/IndexedDB (web)
      db/tinyjs.ts          # bridge driver (select/execute over tiny.api)
      db/idb.ts             # IndexedDB adapter (Dexie), localStorage migration, multi-tab refresh
      sync.ts               # pure two-way merge (stable uids, tombstones, review union)
      syncFile.ts           # sync file I/O: desktop backend / File System Access / download
      platform.ts           # runtime guards (isDesktopRuntime, desktopCall, openExternal)
      ids.ts                # stable uids + device id
      gestures.ts           # drag-gesture hook (tap/flip/grade, fly-out, spring-back)
      backup.ts             # JSON backup/restore + auto-snapshot before destructive ops
      anki.ts               # Anki collection reader (over the backend staging api)
      markdown.tsx / katex.ts  # cloze + KaTeX-aware markdown renderer (with images)
      demo.ts               # deterministic demo content + review history
      derive.ts             # tag tree, queues, limits, leeches, heatmap, streaks, forecasts
      hotkeys.ts / search.ts # shortcut matrix + fuzzy matching
      types.ts, csv.ts, seed.ts, bookmarks.ts
  public/
    revision-logo.png
  docs/                     # this doc + USER_GUIDE.md + diagram sources
  CHANGELOG.md              # release history
  AGENTS.md                 # agent instructions (release checklist, gotchas)
```

## Web app & Vercel

`npm run build` produces a static SPA in `dist/` that runs entirely in the browser on IndexedDB (Dexie). `vercel.json` pins framework/build/output and immutable asset caching; there is no router, so no rewrites are needed.

1. In Vercel: **Add New → Project → import this GitHub repo** (framework auto-detects Vite; build `npm run build`, output `dist`). Every push to `main` deploys to production, PRs get preview URLs.
2. Optional: set a custom domain in Vercel → Domains.
3. Run the web app (**Settings → Sync**) and the desktop app (**Settings → Sync**) against the same JSON file to keep both in sync.

Notes:

- Browser storage: IndexedDB database `revision` (`cards`, `states`, `reviews`, `decks`). Legacy browser builds that used `localStorage` (`revision_*` keys) migrate automatically on first load.
- Web-only limits: Anki import, tray, global `⌥⇧K` and launch-at-login are desktop-only; everything else (FSRS review, imports, backups, CSV, analytics) works in the browser.
- Safari/Firefox lack the File System Access API, so Sync falls back to **Export** / **Import / merge** buttons.
- The whole web bundle is desktop-free: `src/lib/platform.ts` checks for the injected `tiny` global and every desktop call sits behind `isDesktopRuntime()`.

## Sync architecture (for maintainers)

- **Identity**: every card and review carries `uid` (UUID) in both drivers; the DB `id` stays local. Old rows are backfilled on migration.
- **Deletions**: cards are soft-deleted (`cards.deleted_at`) instead of removed, so tombstones can travel through the sync file and propagate.
- **Merge** (`src/lib/sync.ts`, pure and unit-tested): union cards by `uid`; content merges last-write-wins on `updated_at`; scheduling state merges independently on `state_updated_at`; a tombstone wins unless the other side edited after it; reviews are an append-only union deduped by `uid`.
- **Apply**: `applySyncSnapshot` replaces the local store from the merged snapshot in one transaction, preserving local ids by `uid`.
- **Backups are the same format** (`kind: "revision-backup"` vs `"revision-sync"`); legacy v1 backups are upgraded on import (`parseSyncFile`).

## Release process

GitHub Actions (`.github/workflows/release.yml`) builds macOS arm64 + x86_64 dmgs, a Windows portable zip and a Linux x86_64 tarball, and **publishes a GitHub Release whenever a `v*` tag is pushed** (tag name = `v` + version from `tinyjs.json`).

Checklist (full details in [AGENTS.md](../AGENTS.md)):

1. Bump version in **both**: `package.json`, `tinyjs.json`
2. Add a `## [vX.Y.Z]` section to `CHANGELOG.md` (Keep-a-Changelog style) + refresh its version-link footer
3. Update the README download table links **and sizes** (asset names: `revision-{ver}-macos-arm64.dmg`, `revision-{ver}-macos-x86_64.dmg`, `revision-{ver}-win.zip`, `revision-{ver}-linux-x86_64.tar.gz`)
4. Commit → `git push origin main` → `git tag -a vX.Y.Z` → `git push origin vX.Y.Z`
5. Release auto-publishes when the CI matrix (macOS / Windows / Linux jobs) finishes (~10–25 min)

Install straight to `/Applications` locally (no GitHub needed):

```bash
npm run desktop:install   # build + copy to /Applications + relaunch
```
