# Revision — Development

For agent maintenance details (release checklist, gesture architecture, gotchas) see [AGENTS.md](../AGENTS.md). For daily usage see [USER_GUIDE.md](USER_GUIDE.md).

## Stack

- **Tauri 2** + **React 19** + **TypeScript** + **Vite 7** + **KaTeX**
- **Rust** backend: `tauri-plugin-sql` (sqlite), `dialog`, `fs`
- Frontend DB abstraction: `src/lib/db.ts` — auto-falls back to `localStorage` when run as plain web
- Styling: custom design system in `src/App.css` (CSS variables, 4 themes, 3 density scalars, reduced-motion support)

## Run & build

From repo root `revision/`:

```bash
npm install
# Desktop (Tauri) — recommended (macOS overlay titlebar + vibrancy)
npm run tauri dev

# Or preview in browser only (uses localStorage, no Rust needed)
npm run dev              # http://localhost:1420

# Build native binary
npm run tauri build      # .dmg / .exe in src-tauri/target/release/bundle/
npm run build            # web build only -> dist/
```

Requires Rust 1.70+ and system deps (Xcode CLI tools on macOS).

**Verification:** there is no test framework — `npm run build` (tsc strict + vite) is the gate; gesture/hand logic ships without unit tests currently.

## Project layout

```
revision/
  src/
    App.tsx                 # shell: 3-pane layout, keyboard master, review state machine
    App.css                 # design system: tokens (4 themes), components, motion
    Widget.tsx              # 340×190 transparent widget window (Due/New/Total)
    components/             # Sidebar, CommandBar, Inspector, Dashboard, ReviewView,
                            # EditorModal, BrowseView, AnalyticsView, SettingsView,
                            # QuickCapture, HandOverlay, Toast, ui (icons/ring/keycaps)
    lib/
      fsrs.ts               # FSRS-5 scheduler + interval/retrievability predictions
      db.ts / db.browser.ts # SQLite + localStorage fallback (with FSRS migration)
      gestures.ts           # drag-gesture hook (tap/flip/grade, fly-out, spring-back)
      handGestures.ts       # camera hand classifier (pinch + 4-direction swipes)
      markdown.tsx / katex.ts  # cloze + KaTeX-aware markdown renderer
      demo.ts               # deterministic demo content + review history
      ai.ts                 # on-device hint + card generators (no API)
      derive.ts             # tag tree, queues, heatmap, streaks, forecasts
      hotkeys.ts / search.ts # shortcut matrix + fuzzy matching
      types.ts, csv.ts, seed.ts, article.ts, bookmarks.ts
  src-tauri/
    Cargo.toml, tauri.conf.json (main + widget windows, overlay titlebar)
    Info.plist / Entitlements.plist   # macOS camera permission (air gestures)
    RevisionWidget/         # WidgetKit desktop widget (Swift, project.yml via xcodegen)
  public/
    mediapipe/              # bundled WASM + hand_landmarker.task (offline air gestures)
    blind75.csv             # Blind 75 import file
  docs/                     # this doc + USER_GUIDE.md + PLAN-* trackers
  CHANGELOG.md              # release history
  AGENTS.md                 # agent instructions (release checklist, gotchas)
```

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