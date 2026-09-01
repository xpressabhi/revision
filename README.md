# Revision — Active Recall (Tauri + SQLite)

[![Release](https://img.shields.io/github/v/release/xpressabhi/revision?label=latest%20release&style=flat-square)](https://github.com/xpressabhi/revision/releases/latest)
[![Build](https://github.com/xpressabhi/revision/actions/workflows/release.yml/badge.svg)](https://github.com/xpressabhi/revision/actions/workflows/release.yml)

Local-first desktop app for principal-level interview prep. **FSRS-5 spaced repetition** for **DSA / System Design Concepts / System Design Use Cases / AI Concepts / AI Use Cases / Behavioral** — redesigned as a keyboard-first, glassmorphic macOS app.

> Works fully offline. Single SQLite file `revision.db` (Tauri) or `localStorage` (browser preview). No cloud, no account.

---

### v0.2.0 — "Recall" redesign

- **FSRS-5 scheduler** (Free Spaced Repetition Scheduler): stability/difficulty/retrievability per card, live interval predictions on the grading bar (`Again 10m · Hard 1d · Good 3d · Easy 15d`), desired-retention control (80–95%), per-grade projection curves in the inspector.
- **3-pane macOS glass shell**: collapsible translucent sidebar (decks / smart filters / tag graph), central canvas, collapsible FSRS+AI inspector. Vibrancy materials, hairline borders, layered shadows, 4 themes (Slate & Emerald / OLED & Amber, dark + light each, ⌘⇧T cycles).
- **Command bar (⌘K)**: fuzzy search across decks, cards, tags and actions; keyboard-first everything (Space reveal, 1–4 grade, G cloze reveal, H hints, ⇧G undo, ⌃→ skip, S/B suspend/bury, ⌘↵ end).
- **Cloze deletions + LaTeX**: Anki-style `{{c1::answer}}` with progressive per-block reveal (G), KaTeX rendering for `$…$` and `$$…$$` in cards and editor preview.
- **Dashboards & analytics**: GitHub-style 53-week streak heatmap, FSRS retention forecast, review-queue forecast, deck cards with progress rings, grade distribution, memory-load charts.
- **Quick capture (⌘⇧K)** and in-app **AI card generator drawer** (on-device, no API key): paste text → Q&A / cloze / flashcard variants.
- **Demo content**: "Load demo content" in Settings seeds 4 topic decks + ~90 days of review history so the heatmap and analytics are alive on first run.

### Features
- Single-deck data model; topic groups are tag trees (`spanish>vocab`, `dsa>patterns`, …) rendered as decks in the sidebar
- FSRS review queue: learning (10m step) → due → new (capped 20/session), bury/suspend, undo grade
- Browse: search front/back/tags, filter by state and group, edit/delete inline
- Import/Export CSV: `deck,front,back,tags` — drag or button
- Seed 13 starter cards on first run
- SQLite: `revision.db` (Tauri) via `tauri-plugin-sql`, WAL + FK enabled
- Tray: `Due X • New Y` + Start Review / Show / Toggle Widget / Quit
- WidgetKit desktop widget (Due/New/Total), launch-at-login (autostart plugin)

### Stack
- **Tauri 2** + **React 19** + **TypeScript** + **Vite 7** + **KaTeX**
- **Rust** backend: `tauri-plugin-sql` (sqlite), `dialog`, `fs`
- Frontend DB abstraction: `src/lib/db.ts` — auto-falls back to `localStorage` when run as plain web (`npm run dev`)
- Styling: custom design system in `src/App.css` (CSS variables, 4 themes, 3 density scalars, reduced-motion support)

### Run (from repo root `revision/`)
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

### Keyboard map (core)
| Keys | Action |
|---|---|
| `⌘K` | Command bar (decks, cards, actions) |
| `⌘⇧K` | Quick capture |
| `Space` / `↵` | Reveal answer (press again to grade Good) |
| `1 2 3 4` | Grade: Again · Hard · Good · Easy (FSRS predictions show live) |
| `G` | Reveal next cloze block |
| `H` | Next AI hint (inspector) |
| `⇧G` | Undo last grade |
| `⌃→` | Skip card |
| `E` / `S` / `B` | Edit / Suspend / Bury |
| `⌘1–5` | Dashboard · Browse · Review · Analytics · Settings |
| `⌘S` | Sidebar: full → rail → hidden |
| `⌥⌘I` | Toggle inspector |
| `⌘⇧F` | Focus mode |
| `⌘⇧T` | Cycle theme |
| `⌘⌃1–3` | Density: relaxed / standard / compact |
| `⌘,` | Settings |
| `/` | Keyboard-map overlay |

### DB Location
- Tauri: app data dir — e.g. `~/Library/Application Support/com.revision.app/revision.db` (macOS). Use "Export CSV" to back up.
- Browser: `localStorage` keys `revision_cards`, `revision_states`, etc. Clear site data to reset.

### CSV Format
Header optional but recommended:
```
deck,front,back,tags
"DSA / LeetCode","Two Sum — Pattern?","**Pattern:** Hash Map ...","array, hashmap"
```

### Project Layout
```
revision/
  src/
    App.tsx                 # shell: 3-pane layout, keyboard master, review state machine
    App.css                 # design system: tokens (4 themes), components, motion
    Widget.tsx              # 340×190 transparent widget window (Due/New/Total)
    components/             # Sidebar, CommandBar, Inspector, Dashboard, ReviewView,
                            # EditorModal, BrowseView, AnalyticsView, SettingsView,
                            # QuickCapture, Toast, ui (icons/ring/keycaps)
    lib/
      fsrs.ts               # FSRS-5 scheduler + interval/retrievability predictions
      db.ts / db.browser.ts # SQLite + localStorage fallback (with FSRS migration)
      markdown.tsx / katex.ts  # cloze + KaTeX-aware markdown renderer
      demo.ts               # deterministic demo content + review history
      ai.ts                 # on-device hint + card generators (no API)
      derive.ts             # tag tree, queues, heatmap, streaks, forecasts
      hotkeys.ts / search.ts # shortcut matrix + fuzzy matching
      types.ts, csv.ts, seed.ts, article.ts, bookmarks.ts
  src-tauri/
    Cargo.toml, tauri.conf.json (main + widget windows, overlay titlebar)
    RevisionWidget/         # WidgetKit desktop widget (Swift, project.yml via xcodegen)
  public/blind75.csv        # Blind 75 import file
```

### Tray, Widgets & Autostart (no terminal)
- **Tray (always visible):** `Due X • New Y` tooltip, menu with per-deck breakdown, `▶ Start Review`, `Show Revision`, `Toggle Widget`, `Quit`. Live-updates on every stats refresh.
- **In-app widget window:** `340×190` transparent always-on-top; toggle from tray or Settings.
- **macOS Desktop Widget (WidgetKit):** Desktop → right-click → Edit Widgets → search "Revision" → add "Due Today". Reads `revision.db` directly.
- **Launch at login:** Settings toggle (macOS LaunchAgent).

### Updates (local only — no GitHub)
```bash
npm run tauri:build:install   # builds (debug), copies .app to /Applications, embeds widget, relaunches
```

### Tauri Setup
Requires Rust 1.70+ and system deps (Xcode CLI tools on macOS).

### License
MIT — personal use.