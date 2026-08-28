# Revision — Active Recall (Tauri + SQLite)

Local-first desktop app for principal-level interview prep. Spaced repetition for **DSA / System Design Concepts / System Design Use Cases / AI Concepts / AI Use Cases / Behavioral**.

> Works fully offline. Single SQLite file `revision.db` (Tauri) or `localStorage` (browser preview). No cloud, no account.

### Features
- 6 pre-seeded decks, generic Front/Back cards with markdown + code blocks + tags
- Spaced repetition via SM-2: Again (10m) / Good (1d) / Easy (3d+) — stored in `card_state`
- Review queue: due + up to 20 new cards, keyboard `Space` to reveal, `1` `2` `3` to grade
- Browse: search front/back/tags, filter by deck/state, edit/delete
- Import/Export CSV: `deck,front,back,tags` — drag or button
- Seed 13 starter cards covering all pillars
- SQLite: `revision.db` in app data dir (Tauri) via `tauri-plugin-sql`, WAL + FK enabled

### Stack
- **Tauri 2** + **React 19** + **TypeScript** + **Vite 7**
- **Rust** backend: `tauri-plugin-sql` (sqlite), `dialog`, `fs`
- Frontend DB abstraction: `src/lib/db.ts` — auto-falls back to `localStorage` when run as plain web (`npm run dev`) so you can preview without Tauri
- Styling: custom CSS (no Tailwind), responsive, dark sidebar

### Run (from repo root `revision/`)
```bash
npm install
# Desktop (Tauri) — recommended
npm run tauri dev        # opens native window, uses SQLite revision.db

# Or preview in browser only (uses localStorage, no Rust needed)
npm run dev              # http://localhost:1420 — good for UI iteration

# Build native binary
npm run tauri build      # .dmg / .exe / .AppImage in src-tauri/target/release/bundle/
npm run build            # web build only -> dist/
```

### DB Location
- Tauri: app data dir — e.g. `~/Library/Application Support/com.revision.app/revision.db` (macOS). Portable: `Export CSV` to backup.
- Browser: `localStorage` keys `prep_cards`, `prep_states`, etc. Clear site data to reset.

### CSV Format
Header optional but recommended:
```
deck,front,back,tags
"DSA / LeetCode","Two Sum — Pattern?","**Pattern:** Hash Map ...","array, hashmap"
"Behavioral","Best project — STAR","S: ... T: ...","STAR, leadership"
```
Image paste stores as data URL inside `back`.

### Project Layout
```
revision/
  src/
    App.tsx                 # 3 views: Today / Review / Browse + modals + tray/widget sync
    Widget.tsx              # 340×190 transparent widget window (Due/New/Total)
    lib/db.ts               # SQLite + localStorage fallback + clear/dedup
    lib/db.browser.ts       # localStorage impl
    lib/srs.ts              # SM-2 nextState()
    lib/types.ts, csv.ts, seed.ts (SEED_CARDS 13 + BLIND75_SEED 75), markdown.tsx (links)
    App.css                 # design system + widget
  src-tauri/
    Cargo.toml, tauri.conf.json (main + widget windows, updater), capabilities/default.json
    RevisionWidget/         # WidgetKit desktop widget (Swift, project.yml via xcodegen)
      RevisionWidget/RevisionWidget.swift  # TimelineProvider reads revision.db, shows Due/New
  public/blind75.csv        # Blind 75 import file
  scripts/install-to-applications.sh  # builds + embeds widget + copies to /Applications
  scripts/build-widget.sh             # xcodegen + xcodebuild widget appex
```

### Tray, Widgets & Autostart (no terminal)
- **Tray (always visible):** Shows `Due X • New Y` in tooltip + `Due X` title, menu header `Revision — Due X • New Y • Total Z` with per-deck breakdown, actions `▶ Start Review` (opens Review), `Show Revision`, `Toggle Widget`, `Quit`. Live-updates via `update_tray` on every `getDeckStats`.
- **In-app widget window:** `340×190` transparent always-on-top (`src-tauri/tauri.conf.json` `widget` window, `src/Widget.tsx`) — shows `Due/New/Total` KPIs + deck due list + `Review` button. Toggle via tray `Toggle Widget` or in-app `◫ Widget` (Today header + sidebar foot `Toggle Widget`), `×` hides. Drag header to move.
- **macOS Desktop Widget (WidgetKit):** Native widget addable alongside Stocks/Clock/Battery via `Desktop → right-click → Edit Widgets → search "Revision" → Add "Due Today"` (small/medium). Reads `~/Library/Application Support/com.revision.app/revision.db` directly via SQLite3, shows `Due/New/Total` + 4 decks, refreshes every 15 min. Tap widget opens `Revision.app`. Built from `src-tauri/RevisionWidget/` (Swift + WidgetKit, `project.yml` via `xcodegen`), embedded as `Revision.app/Contents/PlugIns/RevisionWidget.appex` on `tauri:build:install` (also `npm run widget:build`).
- **Launch at login:** Sidebar foot toggle `Launch at login` uses `tauri-plugin-autostart` (macOS LaunchAgent).

### Auto-Update
Two modes:
1. **Local rebuild → auto-install to /Applications (for you as dev):**
   ```bash
   npm run tauri:build:install   # builds then copies .app to /Applications and relaunches (tray refreshes)
   # or manually: ./scripts/install-to-applications.sh
   ```
   Script quits running app, `cp -R` new bundle, clears quarantine, `open`s it — tray icon/menu update on next launch.

2. **Remote auto-update when new GitHub Release is available (for installed app):**
   - App checks on launch via `tauri-plugin-updater` — sidebar foot shows `Check for updates` / `Update to vX →` if found.
   - Configure real repo in `src-tauri/tauri.conf.json:plugins.updater.endpoints`:
     ```json
     "endpoints": ["https://github.com/YOUR_USER/YOUR_REPO/releases/latest/download/latest.json"]
     ```
     Current placeholder is `REPLACE_ME/REPLACE_ME` — replace with your GitHub repo, then push with `tauri-action` to generate `latest.json` + signed updater artifacts (`createUpdaterArtifacts: v1Compatible` already enabled).
   - Private key at `src-tauri/keys/updater-key` (ignored), public key already in `tauri.conf.json:pubkey`. For CI, set `TAURI_SIGNING_PRIVATE_KEY` env.
   - Manual check: sidebar `Check for updates` → `Update to vX →` → downloads, installs, `relaunch` (tray refreshes).

### Tauri Setup
Requires Rust 1.70+ and system deps (Xcode CLI tools on macOS). No extra config — `tauri-plugin-sql` with `sqlite` feature already added.

### License
MIT — personal use.
