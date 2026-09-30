# AGENTS.md — guidance for AI agents working in this repo

Local-first flashcard/spaced-repetition app for interview prep. **tinyjs + React 19 + TypeScript + Vite 7 + KaTeX**, FSRS-5 scheduler, SQLite via the tinyjs backend (`tjs:sqlite`) on desktop and IndexedDB (Dexie) in the browser build.

## Commands

| Task | Command |
|---|---|
| Browser-only dev (no desktop shell, IndexedDB via Dexie) | `npm run dev` → http://127.0.0.1:1420 |
| Desktop dev (tinyjs: Vite + native window + backend) | `npm run desktop:dev` |
| Typecheck + web build | `npm run build` (tsc && vite build) |
| Unit tests (Vitest) | `npm test` (or `npm run test:watch`) |
| Package the desktop app | `npm run desktop:build` (→ `dist/Revision.app` + `dist/revision-<ver>.dmg`) |
| Install built app to /Applications | `npm run desktop:install` (build + copy + launch) |

**Verification = `npm test` + `npm run build` + manual/dev-server checks.** Vitest covers the pure libs (`fsrs`, `derive`, `csv`, `markdown`, `session`, `backup`, `sync`) plus the IndexedDB adapter (`db.test.ts`, `db.migration.test.ts` with `fake-indexeddb`) and the backend helpers (`backend/sql.test.ts` placeholder translation, `backend/anki-archive.test.ts` zip/zstd extraction with binary fixtures). There are no component/DOM tests. For browser checks use the dev server; when driving a public page through a browser tool, follow that tool's policy.

## Releasing (READ FIRST — version lives in 2 places)

- GitHub Actions `.github/workflows/release.yml` builds macOS arm64 + x86_64 dmgs (`tinyjs build --arch … --dmg`), a Windows portable zip and a Linux x86_64 tarball (`tinyjs publish`), and **publishes a GitHub Release whenever a `v*` tag is pushed** (tag name = `v` + version from `tinyjs.json`). Pushing to `main` also runs the workflow but only uploads artifacts. `workflow_dispatch` dry-runs on a branch.
- **Bump the version in both manifests before tagging:** `package.json` and `tinyjs.json`.
- Release flow: `git commit` → `git push origin main` → `git tag -a vX.Y.Z -m "..."` → `git push origin vX.Y.Z` → release auto-publishes when the CI jobs finish (~10–25 min).
- **Add the release to `CHANGELOG.md`** (new `## [vX.Y.Z]` section at the top, Keep-a-Changelog style) and refresh the version-link footer — do this in the release commit, before tagging.
- README download links are hardcoded per version (`revision-X.Y.Z-macos-arm64.dmg`, `-macos-x86_64.dmg`, `-win.zip`, `-linux-x86_64.tar.gz`) — update them **and their asset sizes** (sizes come from the CI run's artifacts) when bumping versions.
- Desktop signing is **ad-hoc** (no Developer ID → README's right-click → Open note applies). macOS builds require **macOS 15+**. Linux builds must be made on Ubuntu 22.04 (glibc 2.35 floor); the workflow has a guard for this.
- Do NOT push stale local tags (older tags v0.1.0/v0.2.0/v0.2.1 exist locally but were never pushed to origin; the first real release was v0.3.0).
- To monitor a run without `gh`: `curl -s https://api.github.com/repos/xpressabhi/revision/actions/runs?per_page=1`.

## Architecture

- `src/App.tsx` — shell: 3-pane layout, global keyboard handler, review state machine, toasts. `src/lib/` — pure logic (fsrs, db, derive, markdown, backup, sync, anki, hotkeys, search, csv). `src/components/` — views (Dashboard, ReviewView, BrowseView, AnalyticsView, SettingsView, EditorModal, QuickCapture, CommandBar, Inspector, Sidebar, ImportModal, SyncPanel, Toast, ui).
- **Desktop shell (tinyjs)**: the page has no system access; everything privileged crosses `tiny.api.call` to `backend/main.ts` (txiki.js, bundled by the tinyjs CLI with esbuild; npm packages allowed, no Node builtins/native modules). Backend api: `db.select`/`db.execute` (SQLite, `$n` → `?n` translation in `backend/sql.ts`), `fs.exists/readText/writeText`, `anki.stage/open/select/close/cleanup`, `tray.update`, `log`. Exports: `init`, `onTray`, `onHotkey`.
- Frontend platform guards live in `src/lib/platform.ts` (`isDesktopRuntime`, `desktopCall`, `onDesktopEvent`, `openExternal`); the browser build must never load desktop code. Ambient typings: `src/types/tiny.d.ts` + `src/types/tjs.d.ts` (backend copies in `backend/`); runtime members missing from the shipped types are declared in `backend/tinyjs-extras.d.ts`.
- DB: `src/lib/db.ts` is the repository facade; it delegates to the bridge driver (`src/lib/db/tinyjs.ts`) on desktop or `src/lib/db/idb.ts` (Dexie/IndexedDB) on web. Both must implement the same API. Every card/review has a stable `uid`; cards are soft-deleted via `deleted_at` (tombstones) so deletions can sync.
- Sync: `src/lib/sync.ts` is the pure merge (unit-tested); `src/lib/syncFile.ts` does file I/O (desktop: native dialog + backend fs calls; browser: File System Access / download). Both apps exchange one JSON file; no backend. Keep backup (`kind: "revision-backup"`) and sync (`kind: "revision-sync"`) formats compatible; legacy v1 backups are normalized by `parseSyncFile`.
- Web deploy: Vercel auto-builds `npm run build` → `dist` via `vercel.json`. The SPA is served from `file://` by the desktop shell, hence Vite `base: "./"`.
- Backups: `src/lib/backup.ts` (JSON export/import + `recall_autobackup` snapshot before destructive ops). Anki import: backend stages `collection.anki21` (fflate unzip + fzstd for the `b` format) into `<app data>/anki-import/`, the frontend reads it over `anki.*` calls.
- macOS app bundle lives at `/Applications/Revision.app` (installed via `npm run desktop:install`).

## Gestures

- Pointer drag layer: `src/lib/gestures.ts` (`useDragGesture` hook — deadzone, axis-lock, tap/flip/grade thresholds, fly-out + spring-back) wired in `ReviewView.tsx` on `.flip-wrap`.
- Camera air gestures (MediaPipe) were **removed** — do not reintroduce `getUserMedia`/camera assets without a product decision; the app is pointer/keyboard only.

## Gotchas

- Dev server port 1420 (main app); `tinyjs dev` spawns it for the native window. Tray is the only extra surface (no widget windows anymore).
- **Backend edits aren't watched in `tinyjs dev` (0.42.3)** — restart the dev process (or touch a `src/` file to trigger its restart) after changing `backend/`.
- `tsc` is strict (verbatimModuleSyntax) — use `import type` for type-only imports.
- No comments in code unless the user asks; match existing commit style (`feat:`/`fix:` lowercase, no scope).
- Settings/theme/density/limits persist in `localStorage` (`recall_*` keys). Global quick capture is `⌥⇧K` (tray + backend hotkey → `global-capture` push).
- UX rules: keep the clutter budgets (`node scripts/ux-audit.mjs` — Study ≤6 chrome controls, Browse ≤8, Progress ≤3, Settings ≤6, Review ≤9). One primary action per view, no metric duplicated across surfaces, plain language at level 1, FSRS jargon only in details (Inspector / `?` overlay), advanced or rare actions live in `···` menus or Settings. `/` or `?` opens the keyboard map.
- Responsive breakpoints (web app): ≤1080px inspector hidden, ≤900px sidebar becomes a hamburger drawer, ≤640px single-column grids and overlays become full-screen/bottom sheets. Check mobile changes at 390×844 and desktop at 1440×900.
- SQLite is fully synchronous in the backend (`tjs:sqlite`: `run`/`all`/`finalize`, no `get()`, `run()` returns void); `$n` placeholders are translated to `?n` position-preserving — keep writing SQL the old way.
- The macOS window is a borderless overlay (`chrome` in `tinyjs.json`); drag regions use `data-tiny-drag` on the titlebar. Tray clicks arrive in `onTray` (`null` = bare icon click via `primaryAction`).
