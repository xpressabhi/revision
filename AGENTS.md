# AGENTS.md — guidance for AI agents working in this repo

Local-first flashcard/spaced-repetition app for interview prep. **Tauri 2 + React 19 + TypeScript + Vite 7 + KaTeX**, FSRS-5 scheduler, SQLite via `tauri-plugin-sql` with a `localStorage` fallback for plain-browser runs.

## Commands

| Task | Command |
|---|---|
| Browser-only dev (no Rust, uses localStorage) | `npm run dev` → http://localhost:1420 |
| Desktop dev (Tauri) | `npm run tauri:dev` |
| Typecheck + web build | `npm run build` (tsc && vite build) |
| Tauri debug build only | `npx tauri build --debug` |
| Install built app to /Applications | `./scripts/install-to-applications.sh` (or `npm run tauri:build:install` = build + install) |
| Build/install macOS WidgetKit widget | `./scripts/build-widget.sh` |

**There is no test framework in this repo.** Verification = `npm run build` + manual/dev-server checks (Playwright MCP against `http://localhost:1420` works; note that the dev server may already be running — reuse it, don't start a second one).

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

- `src/App.tsx` — shell: 3-pane layout, global keyboard handler, review state machine, toasts. `src/lib/` — pure logic (fsrs, db, derive, markdown, ai, hotkeys, search, csv). `src/components/` — views (Dashboard, ReviewView, BrowseView, AnalyticsView, SettingsView, EditorModal, QuickCapture, CommandBar, Inspector, Sidebar, Toast, ui).
- Review mapping: hidden card → flip (Space/Enter/click/flick); shown card → grade 1–4 (keys 1–4, Space grades Good, drag/air-swipe directions ← Again · → Good · ↑ Easy · ↓ Hard).
- DB: `src/lib/db.ts` (SQLite via Tauri) with `db.browser.ts` (localStorage) fallback — keep both in sync when changing schema/fields.
- macOS app bundle lives at `/Applications/Revision.app` (installed via script); macOS camera permission is wired via `src-tauri/Info.plist` + `src-tauri/Entitlements.plist` (referenced in `tauri.conf.json` `bundle.macOS.entitlements`).

## Gestures (added v0.3.0)

- Pointer drag layer: `src/lib/gestures.ts` (`useDragGesture` hook — deadzone, axis-lock, tap/flip/grade thresholds, fly-out + spring-back) wired in `ReviewView.tsx` on `.flip-wrap`.
- Camera air gestures (opt-in, Settings → Gestures): `src/components/HandOverlay.tsx` (getUserMedia + MediaPipe detect loop, PiP preview + landmark skeleton) and `src/lib/handGestures.ts` (pinch/swipe classifier with synthetic-testable update API).
- MediaPipe WASM + `hand_landmarker.task` are **committed** under `public/mediapipe/` (app must work offline; the .task model is ~7.8 MB, downloaded from Google's model hub — re-download if missing). The `@mediapipe/tasks-vision` JS bundle is dynamic-imported so it only loads when camera mode is on.
- Headless/CI environments have no camera: `getUserMedia` hangs → `HandOverlay` has a 10 s watchdog (status "timeout"). All gestures must be tried in the real app for camera tuning.

## Gotchas

- Two dev-server-first ports: 1420 (main app). Tray + widget are separate Tauri windows (widget = `index.html?widget=1`).
- WidgetKit widget lives in `src-tauri/RevisionWidget/` (Swift + XcodeGen). `install-to-applications.sh` embeds it but the embed step is buggy when run from repo root (looks for the bundle in the wrong cwd) — if PlugIns is empty, embed manually: `cp -R src-tauri/RevisionWidget/build/Release/RevisionWidget.appex /Applications/Revision.app/Contents/PlugIns/` then `pluginkit -a`.
- `tsc` is strict (verbatimModuleSyntax) — use `import type` for type-only imports.
- No comments in code unless the user asks; match existing commit style (`feat:`/`fix:` lowercase, no scope).
- Settings/theme/density persist in `localStorage` (`recall_*` keys). Air-gestures toggle key: `recall_air_gestures` ("1"/"0").