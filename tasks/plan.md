# Implementation Plan: Tauri → tinyjs migration

## Overview

Port the Revision desktop shell from Tauri 2 to tinyjs v0.42.3 without touching the web build,
the React app's behavior, or the SQLite data model. Full technical detail lives in the design
spec: `docs/superpowers/specs/2026-09-30-tauri-to-tinyjs-migration-design.md` (approved).
Branch: `tinyjs-migration`. Task checklist: `tasks/todo.md`.

## Architecture Decisions

- **Thin shim** (chosen over query-layer rewrite): SQL stays in `src/lib/db.ts`; only the desktop
  seams change (`platform.ts`, new `db/tinyjs.ts` driver, `syncFile.ts`, `anki.ts`, App call sites).
- **SQLite lives in the tinyjs backend** (`tjs:sqlite`, single sync connection); the page reaches it
  through `db.select` / `db.execute` bridge calls. `$n` placeholders are translated to SQLite's
  positional `?n` in the backend, so existing SQL and params arrays work verbatim.
- **Data continuity by keeping `id: com.revision.app`** — same data dir as Tauri on macOS/Windows.
  Linux gets a one-time copy from the legacy `~/.config` path.
- **No embedded Rust.** Backend is `backend/main.ts`, esbuild-bundled by `tinyjs build/dev`.
- **Scope exclusions:** no auto-update adoption, no notarization, no Windows installer, no
  Linux/Windows arm64 in v1 (see spec).

## Task List

### Phase 1: Foundation — the app runs on tinyjs

- [ ] **T1: tinyjs scaffold + first dev boot** (Small)
  - Files: `tinyjs.json`, `icon.png`, `backend/main.ts` (minimal: init + `log` api + ping push),
    `backend/tsconfig.json`, `backend/tiny.d.ts`, `backend/tjs.d.ts`, `src/types/tiny.d.ts`,
    `src/types/tjs.d.ts`, `.gitignore` (`.build/`, `dist/publish/`).
  - Acceptance: `tinyjs dev` opens the native window on Vite `localhost:1420`; frontend HMR works;
    `tiny.log` lines appear in the dev terminal; window shows the app (IndexedDB mode is expected
    until T3); `icon.png` is 1024×1024.
  - Verification: manual `tinyjs dev` run; `npm test` unaffected; record whether `backend/**` edits
    auto-restart (spec open item 1).
  - Depends: none.
- [ ] **T2: Backend DB api + placeholder translation** (Medium)
  - Files: `backend/main.ts` (data paths, sqlite open, `db.select`/`db.execute`),
    `backend/sql.ts` (pure `$n→?n` translation + run-mapping helpers), `backend/sql.test.ts`,
    `src/lib/db.ts` (read-only audit for multi-statement `execute`s — split if found).
  - Acceptance: prepared statements run against the real `revision.db`; `execute` returns
    `{ lastInsertId, rowsAffected }`; placeholders handle `$1..$n` incl. reuse/out-of-order;
    no multi-statement `execute` remains unsplit.
  - Verification: `npm test` (new unit tests) + manual `tiny.api.call('db.select', …)` from devtools
    F12 against real data; `?N` binding verified with a statement per shape used by db.ts.
  - Depends: T1.
- [ ] **T3: Frontend desktop seam** (Medium)
  - Files: `src/lib/platform.ts` (rewrite: `isDesktopRuntime`, `desktopCall`, `onDesktopEvent`,
    `openExternal` via `tiny.app.shell.open`), `src/lib/db/tinyjs.ts` (new driver), `src/lib/db.ts`
    (swap), `vite.config.ts` (`base: "./"`, drop Tauri bits, ignore `.build/**`).
  - Acceptance: under `tinyjs dev`, the app reads/writes the real SQLite DB (dashboard decks,
    create/edit/grade/review persist); no IndexedDB path taken on desktop; browser dev still uses
    Dexie; `npm test` and `npm run build` green.
  - Verification: manual dev smoke on existing data; `npm test`; `npm run build`.
  - Depends: T2.

#### Checkpoint C1 (after T3)
- [ ] App fully functional under `tinyjs dev` (study flow + data persisted in SQLite)
- [ ] `npm test` + `npm run build` green
- [ ] Note bridge latency observed for initDb / grading (perf sanity, spec)

### Phase 2: Feature parity on desktop

- [ ] **T4: Anki import port** (Medium)
  - Files: `backend/anki.ts` (stage/open/select/cleanup; fflate + fzstd), `backend/anki.test.ts`
    + tiny fixtures (anki21 / anki2 / anki21b), `package.json` (fflate, fzstd),
    `src/lib/anki.ts`, `src/App.tsx` (`importAnki` picker + calls).
  - Acceptance: importing `.apkg` with each of the three collection formats works; raw `.anki2`
    copy path preserved; cleanup runs; error message parity when no DB in archive.
  - Verification: fixture tests (`npm test`); manual import in dev with a generated test `.apkg`.
  - Depends: T3.
- [ ] **T5: Sync file port** (Small)
  - Files: `backend/main.ts` (`fs.exists`/`fs.readText`/`fs.writeText`), `src/lib/syncFile.ts`.
  - Acceptance: attach via `tiny.dialog.saveFile`; write + read round-trip on desktop; merge path
    untouched; browser branch unchanged; check what `localhost:4096` in the old CSP was for (grep).
  - Verification: manual attach/sync/read in dev (temp file), JSON inspected; web build unaffected.
  - Depends: T3.
- [ ] **T6: Tray, hotkey, window behavior, autostart** (Medium)
  - Files: `backend/main.ts` (init: hotkey `alt+shift+k`, `setHideOnClose`, `setMinSize(1024,680)`,
    initial tray; `onTray`, `onHotkey`, `tray.update`), `src/App.tsx` (tray.update call, listeners,
    autostart state mapping, `isTauri`→`isDesktop` rename), `src/components/ErrorBoundary.tsx`,
    `tinyjs.json` (`chrome`: frame/windowControls/windowControlsPos tuned).
  - Acceptance: tray title/menu counts update live; Show / ▶ Review / Quit all work; bare icon
    click shows window; ⌥⇧K shows window and opens QuickCapture; close hides (app lives in tray);
    min window size enforced; titlebar overlay matches previous look; autostart toggle works in a
    built app and reports unsupported in dev gracefully.
  - Verification: manual checklist (spec "Testing & verification"); `desktop:build` smoke.
  - Depends: T3.

#### Checkpoint C2 (after T6) — macOS parity
- [ ] Full manual checklist passes on `tinyjs dev` AND a locally built app
- [ ] Existing user data (this machine's `revision.db`) intact through every step

### Phase 3: Shipping

- [ ] **T7: Scripts + local packaging** (Small)
  - Files: `package.json` (remove `@tauri-apps/*`; scripts `desktop:dev/build/install`; deps),
    `scripts/install-to-applications.sh` (`dist/Revision.app`), check `scripts/record-walkthrough.mjs`
    + `ux-audit.mjs` for Tauri assumptions.
  - Acceptance: `npm run desktop:build` → `dist/Revision.app` (+ `--dmg` artifact); `npm run
    desktop:install` installs and launches from /Applications with data intact; no `tauri` scripts
    or deps remain.
  - Verification: run both; open app from /Applications and grade a card.
  - Depends: T6.
- [ ] **T8: CI rewrite + dry run** (Small)
  - Files: `.github/workflows/release.yml`.
  - Acceptance: mac job (both arch dmgs), windows job (zip), linux job (x86_64 tarball, glibc ≤2.35
    guard) with npm test gates; tag → release assets; branch push / dispatch → artifacts only.
  - Verification: `workflow_dispatch` on the branch (or after merge), artifacts downloaded and
    sanity-checked; artifact names recorded for README.
  - Depends: T7.
- [ ] **T9: Cleanup, docs, version bump** (Medium)
  - Files: delete `src-tauri/`; `.gitignore`; `AGENTS.md`, `README.md`, `docs/DEVELOPMENT.md`,
    `docs/USER_GUIDE.md`, `CHANGELOG.md`; `package.json` + `tinyjs.json` → 0.8.0.
  - Acceptance: `grep -ri tauri` finds only historical/changelog mentions (or none); docs describe
    the tinyjs workflow and new requirements (macOS 15+, WebView2, glibc 2.35+); CHANGELOG v0.8.0
    covers the migration incl. Linux data-path caveat; version in exactly 2 files.
  - Verification: greps; `npm test` + `npm run build`; final full verification.
  - Depends: T7, T8.

#### Checkpoint C3 (final)
- [ ] `npm test`, `npm run build`, `npm run desktop:build` all green on a clean tree
- [ ] All spec acceptance items verified or explicitly deferred with user
- [ ] User review → merge to `main` → tag `v0.8.0` → verify release assets → README sizes updated

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Bridge round-trip per query slow | Med | Measure at C1; coarsen only the hot path if needed |
| tjs:sqlite binding/`?N` semantics surprise | Med | T2 verifies each statement shape + fixture tests |
| Anki zstd/zip edge cases | Med | Fixture tests for all three formats; parity error text |
| tinyjs 0.42.3 dev watcher misses `backend/**` | Low | Confirm in T1; document manual restart if real |
| Windows/Linux beta untested locally | High | CI artifact builds in T8; real-machine smoke as pre-announce gate (user) |
| Overlay chrome fidelity | Low | Tune in T6; fallback to default frame |

## Open Questions

- Windows/Linux real-machine smoke test: which machines/VMs will be used before announcing 0.8.0?
  (Does not block implementation; blocks release announcement.)
