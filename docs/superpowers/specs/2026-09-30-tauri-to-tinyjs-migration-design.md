# Migrate Revision from Tauri to tinyjs — design

Date: 2026-09-30
Status: approved design, pending implementation

## Summary

Replace the Tauri 2 desktop shell with [tinyjs](https://tinyjs.app) (tarwin/tinyjsapp, v0.42.3) on
macOS (arm64 + x86_64), Windows (x64, beta), and Linux (x86_64, beta). The React frontend, the
Vite/web build (Vercel), the SQLite data model, and all pure libraries stay as they are. Only the
desktop seams change:

- four Rust commands become backend JS/TS api methods,
- SQLite moves from the `tauri-plugin-sql` webview plugin into the tinyjs backend (`tjs:sqlite`),
- dialogs / fs / opener / autostart / global shortcut / tray / close-to-hide are re-expressed in
  `tiny.*` / `app.*` calls,
- packaging, CI, and docs move to `tinyjs build` / `tinyjs publish`.

Goal: same app, same UX, same data, smaller and simpler stack (no Rust toolchain anywhere).

## Decisions (from design dialogue)

| Decision | Choice |
|---|---|
| Platforms | macOS arm64+x86_64, Windows x64, Linux x86_64 (Windows/Linux = tinyjs beta, accepted) |
| Shipping profile | Match today: mac ad-hoc-signed `.dmg`, Windows/portable zip, Linux tarball; no new CI secrets |
| Approach | In-place migration on branch `tinyjs-migration`, thin shim (no query-layer rewrite) |
| Auto-update | Out of scope for v1 (tinyjs `publish`/manifest adoption is a follow-up) |
| macOS notarization | Out of scope (ad-hoc signing exactly as today) |
| Linux arm64, Windows arm64 | Out of scope for v1 |
| Windows installer (.exe/.msi) | Dropped — tinyjs ships a portable zip |

## Architecture

tinyjs runs the page in the OS webview and a **backend** (txiki.js, QuickJS + libuv) as a separate
process; they talk over a private Unix-domain socket. The page has **no system access** — every
privileged operation crosses `tiny.api.call(...)`; backend→page events use `app.push(...)`.

```
dist/ (Vite build, file://)          backend/main.ts (esbuild-bundled, txiki)
  React app, Dexie for web             api.db.*        sqlite (tjs:sqlite, sync)
  src/lib/db/tinyjs.ts  ── bridge ──▶  api.fs.*        tjs.readFile/writeFile/stat
  tiny.dialog.* (native, page-side)    api.anki.*      fflate + fzstd
                                       api.tray.update app.tray.set
                                       init()          hotkey, hide-on-close, minSize, data migration
```

- **Dev**: `tinyjs dev` spawns `npm run dev` (Vite, port 1420 unchanged), waits for
  `http://localhost:1420`, and opens the native window at it with the `tiny` global injected.
  Frontend edits hot-reload; backend edits are restartable (see Open items — 0.42.3's dev watcher
  covers `src/**` only; if `backend/**` edits don't auto-restart, document manual restart).
- **Build**: `tinyjs build [--arch arm64|x86_64] [--dmg]` → `dist/Revision.app` + bare binary.
  `tinyjs publish` → packaged zip/tarball + manifest for release assets.
- **Production assets are served from `file://`** → Vite must set `base: "./"`.
- No CSP/capability system: the page simply has nothing privileged to gate. The tinyjs innerHTML
  escaping rule applies to any future dynamic HTML (none in app code today).

## Project layout & config

```
tinyjs.json                  # new — config (below)
icon.png                     # new — 1024×1024 app icon (regenerated from existing branding)
backend/main.ts              # new — the whole backend
backend/tsconfig.json        # new — from tinyjs react-ts overlay pattern
backend/tiny.d.ts, tjs.d.ts  # new — ambient types (copied from ~/.tinyjs/template/types/)
src/types/tiny.d.ts,tjs.d.ts # new — ambient types for the frontend project
src-tauri/                   # DELETED when green (Rust, capabilities, icons source)
```

`tinyjs.json` (draft; `chrome` values tuned during visual verification):

```json
{
  "name": "revision",
  "title": "Revision",
  "size": "1280x800",
  "id": "com.revision.app",
  "version": "0.8.0",
  "minTinyjsVersion": "0.42.3",
  "backend": "backend/main.ts",
  "frontend": {
    "build": "npm run build",
    "dist": "dist",
    "dev": "npm run dev",
    "devUrl": "http://localhost:1420"
  },
  "chrome": {
    "frame": false,
    "windowControls": true,
    "windowControlsPos": { "x": 12, "y": 22 }
  }
}
```

- `id` stays `com.revision.app` — it keys the per-app data dir (`~/Library/Application
  Support/<id>` on mac, `%APPDATA%\<id>` on win), which is exactly where Tauri kept
  `revision.db`. **No user data moves on mac/Windows.**
- Window minimum size (1024×680 today) is applied in backend `init` via `win.setMinSize` (no
  `minSize` key exists in tinyjs.json).
- `titleBarStyle: Overlay` is reproduced with `frame:false` + traffic-light
  `windowControlsPos`; a `data-tiny-drag` region keeps the window draggable. Verified visually.
- Dark background `#0e0e12` stays from app CSS; avoid a white flash during load (verify).

## Data continuity

- macOS/Windows: nothing to do — same directory, same file name (`revision.db`, WAL/SHM kept).
- Linux only: tinyjs uses `$XDG_DATA_HOME/<id>` (`~/.local/share/com.revision.app`) while Tauri
  used `$XDG_CONFIG_HOME/<id>` (`~/.config/com.revision.app`). Backend `init` performs a one-time
  copy when the legacy dir exists and the new one does not: `revision.db` plus `-wal`/`-shm`.
  Webview localStorage (theme, sync path, settings) may not carry over on Linux; note it in the
  CHANGELOG.
- Versioning afterwards: version lives in exactly two files — `package.json` and `tinyjs.json`
  (Cargo.toml / tauri.conf.json drop out). AGENTS.md release section updated accordingly.

## Feature port map

| Today (Tauri) | After (tinyjs) | Lives in |
|---|---|---|
| `tauri-plugin-sql` (webview) | `tjs:sqlite` in backend; page keeps `select`/`execute` shape | `src/lib/db/tinyjs.ts` + backend |
| `update_tray(due,new,total)` | `app.tray.set({ title, tooltip, menu })` | backend `tray.update` |
| Tray menu Show / ▶ Review / Quit, click-to-show | `onTray(id)`; `null` = bare click → show | backend |
| `⌥⇧K` → show+focus+`global-capture` | `app.hotkey.register('alt+shift+k')` + `onHotkey` → show + `app.push` | backend |
| close window → hide (`CloseRequested`) | `win.setHideOnClose(true)` | backend `init` |
| `window.show()/set_focus()` | `app.window('main').show()` (activates) | backend |
| plugin-dialog open/save | `tiny.dialog.openFile/saveFile({ types })` | page (`App.tsx`, `syncFile.ts`) |
| plugin-fs exists/read/write | `tjs.readFile/writeFile/stat` behind `fs.*` | backend |
| plugin-opener | `tiny.app.shell.open(url)` | `platform.ts` |
| plugin-autostart (`isEnabled`, enable/disable) | `tiny.app.launchAtLogin.get()/set(bool)`; get returns `'enabled'\|'disabled'\|'requires-approval'\|'unsupported'` | `App.tsx` |
| `stage_anki_db` (Rust zip+zstd) | backend `anki.stage` — `fflate` (zip) + `fzstd` (`.anki21b`) | backend |
| `cleanup_anki_import` | backend `anki.cleanup` | backend |
| `debug_log` | `tiny.log` | `platform.ts` |
| CSP, capabilities, scopes, Entitlements | nothing to port (page has no privileges) | — |

## Frontend changes (file by file)

- `src/lib/platform.ts` — becomes tinyjs-aware, keeps the web fallbacks:
  - `isDesktopRuntime()` = `typeof window !== 'undefined' && 'tiny' in window` (replaces
    `isTauriRuntime`).
  - `desktopCall<T>(method, params)` → `window.tiny.api.call(method, params)`.
  - `onDesktopEvent(event, handler)` → `tiny.api.on` (returns unsubscribe).
  - `openExternal` → `tiny.app.shell.open(url)` on desktop, `window.open` on web.
  - `deviceName()` unchanged behavior; `debug_log` calls become `desktopCall('log', ...)`.
- `src/lib/db.ts` — `useBrowserStorage = !isDesktopRuntime()`; `getDb()` returns the new driver;
  SQL is unchanged except `$1..$n` placeholders map to the backend's `?N` translation (done in
  backend). Everything else in the facade untouched.
- `src/lib/db/tinyjs.ts` (new) — driver singleton exposing `select<Row>(sql, params)` and
  `execute(sql, params) -> { lastInsertId, rowsAffected }` over `desktopCall('db.select'…)` /
  `'db.execute'`. The placeholder-translation helper is pure and unit-tested.
- `src/lib/anki.ts` — `Database.load("sqlite:"+rel)` becomes `anki.open(rel)`; selects become
  `anki.select`; row-mapping/HTML-cleaning logic unchanged.
- `src/lib/syncFile.ts` — desktop branch: attach via `tiny.dialog.saveFile({ types:['json'] })`;
  read/write/exists via `fs.*` desktop calls. Path stays in `localStorage` under the same key.
  Browser branch untouched.
- `src/App.tsx` — call-site swaps only: `tray.update`, autostart mapping, `global-capture` +
  `tray-review` listeners, Anki file picker via `tiny.dialog.openFile`, removal of all
  `@tauri-apps/*` imports.
- `src/components/ErrorBoundary.tsx` — `log` desktop call.
- `vite.config.ts` — `base: "./"`; drop `TAURI_DEV_HOST`/`src-tauri` handling; keep port 1420
  `strictPort`; ignore `.build/**` (tinyjs scratch) and `dist/**` in the watcher.
- `package.json` — remove all `@tauri-apps/*` deps; add `fflate`, `fzstd` (backend-bundled
  build-time deps); scripts: `desktop:dev` = `tinyjs dev`, `desktop:build` = `tinyjs build --dmg`,
  `desktop:install` = `tinyjs build && ./scripts/install-to-applications.sh`; drop `tauri*` scripts.

## Backend design (`backend/main.ts`)

Bridge contract (api methods, all `{ params } → result`, errors reject the page promise):

| method | behavior |
|---|---|
| `db.select {sql, params}` | prepared `all()`; rows as plain objects |
| `db.execute {sql, params}` | `run()`; returns `{ lastInsertId, rowsAffected }` via `last_insert_rowid()`/`changes()` |
| `fs.exists {path}` | `true/false` |
| `fs.readText {path}` | string; rejects like today if unreadable |
| `fs.writeText {path, text}` | `tjs.writeFile` |
| `anki.stage {path}` | extract/convert → `data/anki-import/collection.anki21`; returns `'anki-import/collection.anki21'` |
| `anki.open {rel}` | open staged db handle (read-only use) |
| `anki.select {sql, params}` | staged-db query |
| `anki.cleanup {}` | rm -rf the staging dir |
| `tray.update {due,new,total}` | `app.tray.set` rebuild of menu/title/tooltip |
| `log {msg}` | `tiny.log` |

- **SQLite**: one `new Database(dataDir + '/revision.db')`, opened lazily; fully synchronous.
  SQLite placeholders arrive as `$n` and are translated to SQLite's native `?n` form
  (position-preserving, so the existing params arrays work verbatim). `db.ts`'s existing
  `BEGIN/COMMIT/ROLLBACK` executes still work — same single connection.
  Open-item check: audit that no `execute` call contains multiple statements in one string
  (prepare would reject); split in the backend if any exists.
- **Anki import (parity with today's Rust)**: read source bytes; `.apkg`/`.zip` → `fflate`
  unzip → first of `collection.anki21` → copy out, `collection.anki2` → copy out,
  `collection.anki21b` → `fzstd` decompress → write out; otherwise raw copy. Same error message
  on empty archives. `.colpkg` keeps today's raw-copy behavior (no silent change).
- **Startup (`init(app)`)**: ensure data dir; Linux legacy copy; open db; register hotkey
  (`try/catch`, log-only failure like today); initial tray; `setHideOnClose(true)`;
  `win.setMinSize(1024, 680)`; forward `windowClosed`-style cleanup only where needed (none
  today — tray app).
- **Exports**: `api`, `init`, `onHotkey`, `onTray`. No menus beyond the tray; no deep links.
- **Errors**: thrown `Error` with the same messages users see today; the bridge surfaces them
  as rejected promises exactly like `invoke` did.

## Repo, scripts, docs

- `scripts/install-to-applications.sh` — source becomes `dist/Revision.app`; keeps
  quit → remove → copy → de-quarantine → launch behavior.
- `package.json` scripts: `desktop:dev`, `desktop:build`, `desktop:install`
  (`tinyjs build && ./scripts/install-to-applications.sh`). `dev`/`build`/`test` unchanged
  (web + CI).
- Delete: `src-tauri/` (incl. `Entitlements.plist`, `capabilities`, icon set after `icon.png` is
  regenerated at 1024×1024 from `public/revision-logo.png` / existing sources).
- `.gitignore`: add `.build/`, `dist/publish/` (keep existing `dist/`, `src-tauri/target` entries
  until the dir is removed).
- Docs, in the release commit or just before:
  - `AGENTS.md` — commands, architecture (backend/bridge, no Rust), release flow (two version
    files, artifact name patterns, CI), new gotchas (macOS 15+, bridge, sqlite in backend,
    Linux legacy data path, backend restart caveat).
  - `README.md` — download table + sizes with real artifact names, platform requirements
    (macOS 15+, WebView2, webkit2gtk 4.1 / glibc 2.35+), dev instructions, keep the ad-hoc
    Gatekeeper note.
  - `docs/DEVELOPMENT.md` — stack/commands rewrite for tinyjs.
  - `docs/USER_GUIDE.md` — desktop behaviors unchanged; add Linux first-run note if visible.
  - `CHANGELOG.md` — `## [v0.8.0]` section: migrated shell, smaller app, macOS floor 15+,
    Windows now portable zip, Linux build added, Linux settings localStorage caveat.
- `scripts/record-walkthrough.mjs`, `scripts/ux-audit.mjs` — check for Tauri assumptions, keep
  or adjust.

## Release pipeline (GitHub Actions)

Rewrite `.github/workflows/release.yml` — same trigger semantics (push to `main` = artifacts;
`v*` tag = GitHub Release), no `tauri-action`, no Rust:

- **macOS job** (`macos-latest`): install tinyjs CLI (`curl -fsSL https://tinyjs.app/install | sh`),
  `npm ci`, `npm test`, then `tinyjs build --arch arm64 --dmg` and
  `tinyjs build --arch x86_64 --dmg` (both from any Mac). Assets: two `.dmg`s. Artifacts uploaded
  on every run.
- **Windows job** (`windows-latest`): install via `irm https://tinyjs.app/install.ps1 | iex`,
  `npm ci`, `npm test`, `tinyjs publish` → `dist/publish/revision-<ver>-win.zip`. Built on
  Windows only (no cross-compile in tinyjs).
- **Linux job** (`ubuntu-22.04` runner or `ubuntu:22.04` container — glibc 2.35 floor rule;
  never build on 24.04): install tinyjs CLI (`curl -fsSL https://tinyjs.app/install | sh`),
  `npm ci`, `npm test`, `tinyjs publish` → x86_64 tarball; include a CI guard running the
  `objdump -T … | grep GLIBC_ | sort -uV | tail -1` ≤ 2.35 check from the tinyjs release guide.
- Release step: on tags, upload assets to the GitHub Release (dmg ×2, win zip, linux tarball).
  Release body updated for the new formats. `GITHUB_TOKEN` only — no new secrets.
- Artifact naming and README links/sizes are captured from the first real dry-run (branch push)
  and from the first tagged build; README updated with real sizes afterwards.

## Testing & verification

- Unit: `npm test` green throughout; new pure helpers (placeholder translation, anki
  extension-selection) get vitest coverage; existing idb/db tests unchanged.
- Web: `npm run build` + Vite dev smoke; Vercel unaffected.
- Desktop (mac, `tinyjs dev` then built app): first run; create/edit/grade; dashboard counts →
  tray title/menu; ⌥⇧K capture; close-to-tray; quit via tray; open external links;
  autostart toggle (built app); Anki import of `collection.anki21`, `collection.anki2`, and
  `collection.anki21b` fixtures; sync-file attach/read/write; error-boundary log path.
- Data: existing `~/Library/Application Support/com.revision.app/revision.db` opens with
  reviews intact (this machine has real data to verify against).
- Perf sanity: time `initDb`, a review session, and a full sync round-trip over the bridge;
  flag if pathological (the one deliberate risk of the thin-shim approach).
- CI dry-run on the branch; then tag `v0.8.0` and verify all four assets exist and download.
- Windows/Linux: CI builds verify artifacts; **real-machine smoke test is an open item** —
  needs hardware/VMs before announcing.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| macOS floor rises to 15+ (tinyjs runtime) | Document in README/CHANGELOG; web app still serves older macs |
| Windows/Linux tinyjs is beta, untested locally | CI builds + user smoke test before announcement; rollback = v0.7.0 Tauri release stays available |
| Bridge round-trip per DB query | Volume is small; measured in verification; coarsen only if needed |
| Backend dev-restart watcher gap in 0.42.3 | Verify; if real, document manual restart (backend edits are rare) |
| Overlay titlebar fidelity | `chrome` config + visual tuning in dev; fall back to default frame if it fights the design |
| `$n → ?n` translation edge cases | Mechanical, position-preserving; audited + tested; params arrays unchanged |

## Out of scope (explicit)

auto-update manifest adoption; macOS notarization; Windows installer; Linux/Windows arm64;
mobile; any query-layer refactor; web-app behavior changes.

## Rollout

1. Branch `tinyjs-migration` (already created); commit this spec.
2. Port backend + `tinyjs.json` + icon; keep `src-tauri` in tree until green.
3. Port the four frontend seams; tests.
4. macOS smoke via `tinyjs dev` + local build + `/Applications` install; data-continuity check.
5. Rewrite CI; dry-run artifacts on the branch.
6. Delete `src-tauri`; update scripts/docs; bump to 0.8.0.
7. User review/merge → tag `v0.8.0` → release; verify assets; update README sizes.
   Rollback: revert the merge / keep using v0.7.0 artifacts.

## Open items to verify during implementation

1. Backend auto-restart in `tinyjs dev` for `backend/**` edits (watcher covers `src/**` in 0.42.3).
2. `?N` binding semantics in `tjs:sqlite` (positional args) against real statements.
3. Audit `db.ts` for multi-statement `execute` strings.
4. `tiny.dialog.openFile` type filters vs today's Anki picker filters.
5. What `http://localhost:4096` in the old CSP was for (unused? remove or port).
6. `tinyjs publish` without `update.url` produces usable zips/tarballs (placeholder manifest).
7. Real artifact names/sizes from a dry-run build → README table.
8. Chrome overlay values (`windowControlsPos`) against the existing header layout.
9. `launchAtLogin` states vs the current autostart toggle UX (dev = `unsupported`).
