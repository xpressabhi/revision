# Revision — Active Recall (Tauri + SQLite)

[![Release](https://img.shields.io/github/v/release/xpressabhi/revision?label=latest%20release&style=flat-square)](https://github.com/xpressabhi/revision/releases/latest)
[![Build](https://github.com/xpressabhi/revision/actions/workflows/release.yml/badge.svg)](https://github.com/xpressabhi/revision/actions/workflows/release.yml)

Local-first desktop app for principal-level interview prep. Spaced repetition for **DSA / System Design Concepts / System Design Use Cases / AI Concepts / AI Use Cases / Behavioral**.

> Works fully offline. Single SQLite file `revision.db` (Tauri) or `localStorage` (browser preview). No cloud, no account.

### Download — Windows & macOS

> **Latest release:** https://github.com/xpressabhi/revision/releases/latest — download the installer for your OS below. No sign-in required.

| Platform | Installer | Direct link (latest) |
|---|---|---|
| **macOS Apple Silicon** | `Revision_0.1.0_aarch64.dmg` | [Download .dmg (arm64)](https://github.com/xpressabhi/revision/releases/latest/download/Revision_0.1.0_aarch64.dmg) |
| **macOS Intel** | `Revision_0.1.0_x64.dmg` | [Download .dmg (Intel)](https://github.com/xpressabhi/revision/releases/latest/download/Revision_0.1.0_x64.dmg) |
| **Windows 10/11** | `Revision_0.1.0_x64-setup.exe` (NSIS) | [Download .exe](https://github.com/xpressabhi/revision/releases/latest/download/Revision_0.1.0_x64-setup.exe) |
| **Windows 10/11** | `Revision_0.1.0_x64_en-US.msi` (MSI) | [Download .msi](https://github.com/xpressabhi/revision/releases/latest/download/Revision_0.1.0_x64_en-US.msi) |

**How to install:**
- **macOS:** Open the `.dmg` → drag `Revision` to `Applications` → first launch right-click → Open (unsigned build).
- **Windows:** Run the `.exe` (or `.msi`) → follow installer → launch from Start Menu.

> If a direct link 404s, the release hasn't been published yet — use the [Releases page](https://github.com/xpressabhi/revision/releases) or the [Actions artifacts](https://github.com/xpressabhi/revision/actions/workflows/release.yml) (every push to `main` builds a `.dmg` + `.exe` you can download without a release).

<details>
<summary><strong>For maintainers: create a new release (triggers .exe + .dmg build)</strong></summary>

```bash
# bump version in package.json + src-tauri/tauri.conf.json + src-tauri/Cargo.toml together
npm version patch   # or minor/major — updates package.json + creates git tag v0.1.x
# make sure tauri.conf.json and Cargo.toml version match package.json, then:
git push origin main --tags
# or manually:
git tag v0.1.0
git push origin v0.1.0
```

Tag push triggers `.github/workflows/release.yml` on `macos-latest` + `windows-latest`:
- builds `Revision_0.1.0_aarch64.dmg` / `Revision_0.1.0_x64.dmg` and `Revision_0.1.0_x64-setup.exe` / `.msi`
- publishes them to `https://github.com/xpressabhi/revision/releases/tag/v0.1.0`
- every push to `main` also builds and uploads the same bundles as **Actions artifacts** (download from the Actions tab without a release)

Local build without CI:
```bash
npm run tauri build   # -> src-tauri/target/release/bundle/dmg/*.dmg  and  nsis/*.exe / msi/*.msi (platform-specific)

# On macOS 27 / Xcode 27 beta, stable Rust 1.98 fails with:
#   "mis-aligned LINKEDIT string pool" for sqlx_macros.
# Use nightly (fixed in 1.100+):
#   rustup toolchain install nightly
#   rustup default nightly   # or: rustup override set nightly
#   npm run tauri build
# GitHub Actions already uses nightly for macOS, so CI is unaffected.
```
</details>

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
- Browser: `localStorage` keys `revision_cards`, `revision_states`, etc. Clear site data to reset.

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
    Cargo.toml, tauri.conf.json (main + widget windows), capabilities/default.json
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

### Updates (local only — no GitHub)
- Rebuild locally and auto-install to `/Applications`:
  ```bash
  npm run tauri:build:install   # builds (debug) then copies .app to /Applications, embeds widget, and relaunches (tray/widget refresh)
  # or manually: ./scripts/install-to-applications.sh
  ```
  Script quits running app, `cp -R` new bundle, clears quarantine, `open`s it — tray icon/menu/widget update on next launch. No remote updater (removed `tauri-plugin-updater` — personal use only).

### Tauri Setup
Requires Rust 1.70+ and system deps (Xcode CLI tools on macOS). No extra config — `tauri-plugin-sql` with `sqlite` feature already added.

### License
MIT — personal use.
