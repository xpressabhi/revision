# AGENTS.md — guidance for AI agents working in this repo

Local-first flashcard/spaced-repetition app for interview prep. **Tauri 2 + React 19 + TypeScript + Vite 7 + KaTeX**, FSRS-5 scheduler, SQLite via `tauri-plugin-sql` on desktop and IndexedDB (Dexie) in the browser build.

## Commands

| Task | Command |
|---|---|
| Browser-only dev (no Rust, IndexedDB via Dexie) | `npm run dev` → http://localhost:1420 |
| Desktop dev (Tauri) | `npm run tauri:dev` |
| Typecheck + web build | `npm run build` (tsc && vite build) |
| Unit tests (Vitest) | `npm test` (or `npm run test:watch`) |
| Tauri debug build only | `npx tauri build --debug` |
| Install built app to /Applications | `./scripts/install-to-applications.sh` (or `npm run tauri:build:install` = build + install) |

**Verification = `npm test` + `npm run build` + manual/dev-server checks.** Vitest covers the pure libs (`fsrs`, `derive`, `csv`, `markdown`, `session`, `backup`, `sync`) plus the IndexedDB adapter (`db.test.ts`, `db.migration.test.ts` with `fake-indexeddb`); there are no component/DOM tests. Playwright MCP against `http://localhost:1420` works for manual checks (note the dev server may already be running — reuse it, don't start a second one).

## Releasing (READ FIRST — version lives in 3 places)

- GitHub Actions `.github/workflows/release.yml` builds macOS arm64 + x64 + Windows and **publishes a GitHub Release whenever a `v*` tag is pushed** (tag name = `v` + version from `src-tauri/tauri.conf.json`). Pushing to `main` also runs the workflow but only uploads artifacts.
- **Bump the version in all three manifests before tagging:**
  1. `package.json` (`version`)
  2. `src-tauri/tauri.conf.json` (`version`)
  3. `src-tauri/Cargo.toml` (`[package] version`)
- Release flow: `git commit` → `git push origin main` → `git tag -a vX.Y.Z -m "..."` → `git push origin vX.Y.Z` → release auto-publishes when the 3 matrix builds finish (~10–25 min).
- **Add the release to `CHANGELOG.md`** (new `## [vX.Y.Z]` section at the top, Keep-a-Changelog style) and refresh the version-link footer — do this in the release commit, before tagging.
- **Docs live in**: `README.md` (landing + download table), `docs/USER_GUIDE.md` (usage), `docs/DEVELOPMENT.md` (dev), `CHANGELOG.md` (history), `AGENTS.md` (this file). When a feature lands, keep the relevant doc in sync.
- Do NOT push stale local tags (older tags v0.1.0/v0.2.0/v0.2.1 exist locally but were never pushed to origin; the first real release was v0.3.0).
- To monitor a run without `gh`: `curl -s https://api.github.com/repos/xpressabhi/revision/actions/runs?per_page=1`.
- README download links are hardcoded per version (`Revision_X.Y.Z_*.dmg` etc.) — update them **and their asset sizes** (fetch from `curl -s https://api.github.com/repos/xpressabhi/revision/releases | grep '"size"'`) in README when bumping versions. Asset name patterns: `Revision_{ver}_aarch64.dmg`, `Revision_{ver}_x64.dmg`, `Revision_{ver}_x64-setup.exe`, `Revision_{ver}_x64_en-US.msi`.

## Architecture

- `src/App.tsx` — shell: 3-pane layout, global keyboard handler, review state machine, toasts. `src/lib/` — pure logic (fsrs, db, derive, markdown, backup, sync, anki, hotkeys, search, csv). `src/components/` — views (Dashboard, ReviewView, BrowseView, AnalyticsView, SettingsView, EditorModal, QuickCapture, CommandBar, Inspector, Sidebar, ImportModal, SyncPanel, Toast, ui).
- Review mapping: hidden card → flip (Space/Enter/click/flick); shown card → grade 1–4 (keys 1–4, Space grades Good, drag directions ← Again · → Good · ↑ Easy · ↓ Hard).
- DB: `src/lib/db.ts` is the repository facade; it delegates to the SQLite driver (Tauri) or `src/lib/db/idb.ts` (Dexie/IndexedDB web). Both must implement the same API. Every card/review has a stable `uid`; cards are soft-deleted via `deleted_at` (tombstones) so deletions can sync.
- Sync: `src/lib/sync.ts` is the pure merge (unit-tested); `src/lib/syncFile.ts` does file I/O (Tauri `plugin-fs` path vs browser File System Access / download). Both apps exchange one JSON file; no backend. Keep backup (`kind: "revision-backup"`) and sync (`kind: "revision-sync"`) formats compatible; legacy v1 backups are normalized by `parseSyncFile`.
- Web deploy: Vercel auto-builds `npm run build` → `dist` via `vercel.json`. `src/lib/platform.ts` keeps Tauri imports dynamic so the web bundle never loads them.
- Backups: `src/lib/backup.ts` (JSON export/import + `recall_autobackup` snapshot before destructive ops). Anki import: Rust `stage_anki_db` (zip/zstd) + `src/lib/anki.ts` (reads the staged SQLite through the sql plugin).
- macOS app bundle lives at `/Applications/Revision.app` (installed via script).

## Gestures (v0.3.0, camera mode removed later)

- Pointer drag layer: `src/lib/gestures.ts` (`useDragGesture` hook — deadzone, axis-lock, tap/flip/grade thresholds, fly-out + spring-back) wired in `ReviewView.tsx` on `.flip-wrap`.
- Camera air gestures (MediaPipe) were **removed** — do not reintroduce `getUserMedia`/camera assets without a product decision; the app is pointer/keyboard only.

## Gotchas

- Dev server port 1420 (main app). Tray is the only extra surface (no widget windows anymore).
- `tsc` is strict (verbatimModuleSyntax) — use `import type` for type-only imports.
- No comments in code unless the user asks; match existing commit style (`feat:`/`fix:` lowercase, no scope).
- Settings/theme/density/limits persist in `localStorage` (`recall_*` keys). Global quick capture is `⌥⇧K` (registered in Rust, event `global-capture`).
- The Anki staging command extracts to the app config dir (`anki-import/collection.anki21`) because `tauri-plugin-sql` resolves `sqlite:` paths relative to `app_config_dir()`.
