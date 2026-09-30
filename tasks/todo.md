# Tauri → tinyjs migration — task checklist

Spec: `docs/superpowers/specs/2026-09-30-tauri-to-tinyjs-migration-design.md`
Plan: `tasks/plan.md`

## Phase 1 — the app runs on tinyjs

- [x] T1: tinyjs scaffold + first dev boot (tinyjs.json, icon.png, backend skeleton, types)
- [x] T2: backend DB api + `$n→?n` translation + tests + multi-statement audit
- [x] T3: frontend desktop seam (platform.ts, db/tinyjs.ts, db.ts, vite.config.ts)
- [x] T5: sync-file port (backend fs.*, syncFile.ts) — folded into T3 (same platform seam)

### Checkpoint C1
- [ ] App functional under `tinyjs dev` on real SQLite data
- [ ] `npm test` + `npm run build` green
- [ ] Bridge-latency sanity note recorded

## Phase 2 — feature parity on desktop

- [x] T4: Anki import port (backend anki.*, fflate/fzstd, fixtures, anki.ts, App picker)
- [x] T6: tray + hotkey + window behavior + autostart (backend, App.tsx, chrome)
- [ ] T6b (manual, user): eyeball traffic-light position, click tray menu, press ⌥⇧K in the running dev app

### Checkpoint C2 — macOS parity
- [ ] Manual checklist passes on dev build AND locally built app
- [ ] Real user data intact throughout

## Phase 3 — shipping

- [ ] T7: scripts + local packaging (package.json, install script, desktop build/install smoke)
- [ ] T8: CI rewrite + dry run (mac/win/linux jobs, artifact names recorded)
- [ ] T9: cleanup + docs + version 0.8.0 (delete src-tauri, AGENTS/README/DEVELOPMENT/USER_GUIDE, CHANGELOG)

### Checkpoint C3 — final
- [ ] test + build + desktop build green on clean tree
- [ ] All acceptance items verified or explicitly deferred
- [ ] Merge → tag v0.8.0 → verify assets → README sizes

## Spec open items (resolve in-task)

- [x] 1. `backend/**` auto-restart in `tinyjs dev` (T1) — backend/ not watched; src/ edits restart backend (documented)
- [x] 2. `?N` binding semantics verified (T2)
- [x] 3. multi-statement `execute` audit (T2) — clean, every execute is one statement
- [x] 4. Anki dialog type filters parity (T4) — same extension list via tiny.dialog.openFile; native title arg not supported by the API
- [x] 5. `localhost:4096` CSP origin purpose (T5) — checked: only referenced in the old tauri.conf CSP; no code uses it
- [ ] 6. `tinyjs publish` sans `update.url` (T8)
- [ ] 7. real artifact names/sizes → README (T7/T8/T9)
- [x] 8. chrome overlay values tuning (T6) — x:18 y:19, user eyeball pending
- [x] 9. `launchAtLogin` states vs autostart toggle UX (T6) — enabled/requires-approval → on; unsupported → warn toast
