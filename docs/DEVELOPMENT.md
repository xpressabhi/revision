# Revision — Development

For agent maintenance details (release checklist, gesture architecture, gotchas) see [AGENTS.md](../AGENTS.md). For daily usage see [USER_GUIDE.md](USER_GUIDE.md).

## Stack

- **Tauri 2** + **React 19** + **TypeScript** + **Vite 7** + **KaTeX**
- **Rust** backend: `tauri-plugin-sql` (sqlite), `dialog`, `fs`
- Frontend DB abstraction: `src/lib/db.ts` — picks the SQLite driver under Tauri, otherwise the Dexie/IndexedDB driver (`src/lib/db/idb.ts`)
- Sync: `src/lib/sync.ts` (pure merge) + `src/lib/syncFile.ts` (file I/O: Tauri path vs browser File System Access / download)
- Styling: custom design system in `src/App.css` (CSS variables, 4 themes, 3 density scalars, reduced-motion support)

## Run & build

From repo root `revision/`:

```bash
npm install
# Desktop (Tauri) — recommended (macOS overlay titlebar + vibrancy)
npm run tauri dev

# Or preview in browser only (IndexedDB, no Rust needed)
npm run dev              # http://localhost:1420

# Build native binary
npm run tauri build      # .dmg / .exe in src-tauri/target/release/bundle/
npm run build            # web build only -> dist/ (same output Vercel deploys)
```

Requires Rust 1.70+ and system deps (Xcode CLI tools on macOS).

**Verification:** `npm test` (Vitest — `fsrs`, `derive`, `csv`, `markdown`, `session`, `backup`, `sync`, and the IndexedDB adapter via `fake-indexeddb`) plus `npm run build` (tsc strict + vite). There are no component/DOM tests yet; use the dev server + Playwright MCP for manual checks.

## Project layout

```
revision/
  src/
    App.tsx                 # shell: 3-pane layout, keyboard master, review state machine
    App.css                 # design system: tokens (4 themes), components, motion
    components/             # Sidebar, CommandBar, Inspector, Dashboard, ReviewView,
                            # EditorModal, BrowseView, AnalyticsView, SettingsView,
                            # QuickCapture, ImportModal, SyncPanel, Toast, ui
    lib/
      fsrs.ts               # FSRS-5 scheduler + interval/retrievability predictions
      db.ts                 # repository facade: SQLite (Tauri) or Dexie/IndexedDB (web)
      db/idb.ts             # IndexedDB adapter (Dexie), localStorage migration, multi-tab refresh
      sync.ts               # pure two-way merge (stable uids, tombstones, review union)
      syncFile.ts           # sync file I/O: Tauri path / File System Access / download
      platform.ts           # runtime guards (isTauriRuntime, invokeTauri, openExternal)
      ids.ts                # stable uids + device id
      gestures.ts           # drag-gesture hook (tap/flip/grade, fly-out, spring-back)
      backup.ts             # JSON backup/restore + auto-snapshot before destructive ops
      anki.ts               # Anki collection reader (via Rust staging + sql plugin)
      markdown.tsx / katex.ts  # cloze + KaTeX-aware markdown renderer (with images)
      demo.ts               # deterministic demo content + review history
      derive.ts             # tag tree, queues, limits, leeches, heatmap, streaks, forecasts
      hotkeys.ts / search.ts # shortcut matrix + fuzzy matching
      types.ts, csv.ts, seed.ts, bookmarks.ts
  src-tauri/
    Cargo.toml, tauri.conf.json (single main window, overlay titlebar, CSP)
    Entitlements.plist      # ad-hoc signing entitlements
    src/lib.rs              # tray, global shortcut (⌥⇧K), Anki staging commands
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
- The whole web bundle is Tauri-free: `src/lib/platform.ts` loads Tauri APIs dynamically behind `isTauriRuntime()`.

## Sync architecture (for maintainers)

- **Identity**: every card and review carries `uid` (UUID) in both drivers; the DB `id` stays local. Old rows are backfilled on migration.
- **Deletions**: cards are soft-deleted (`cards.deleted_at`) instead of removed, so tombstones can travel through the sync file and propagate.
- **Merge** (`src/lib/sync.ts`, pure and unit-tested): union cards by `uid`; content merges last-write-wins on `updated_at`; scheduling state merges independently on `state_updated_at`; a tombstone wins unless the other side edited after it; reviews are an append-only union deduped by `uid`.
- **Apply**: `applySyncSnapshot` replaces the local store from the merged snapshot in one transaction, preserving local ids by `uid`.
- **Backups are the same format** (`kind: "revision-backup"` vs `"revision-sync"`); legacy v1 backups are upgraded on import (`parseSyncFile`).

## Release process

GitHub Actions (`.github/workflows/release.yml`) builds macOS arm64 + x64 + Windows installers and **publishes a GitHub Release whenever a `v*` tag is pushed** (tag name = `v` + version from `src-tauri/tauri.conf.json`).

Checklist (full details in [AGENTS.md](../AGENTS.md)):

1. Bump version in **all three**: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
2. Add a `## [vX.Y.Z]` section to `CHANGELOG.md` (Keep-a-Changelog style) + refresh its version-link footer
3. Update the README download table links **and sizes** (asset names: `Revision_{ver}_aarch64.dmg`, `Revision_{ver}_x64.dmg`, `Revision_{ver}_x64-setup.exe`, `Revision_{ver}_x64_en-US.msi`)
4. Commit → `git push origin main` → `git tag -a vX.Y.Z` → `git push origin vX.Y.Z`
5. Release auto-publishes when the 3 matrix builds finish (~10–25 min)

Install straight to `/Applications` locally (no GitHub needed):

```bash
npm run tauri:build:install   # debug build + install + widget embed + relaunch
```