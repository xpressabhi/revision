# Changelog

All notable changes to Revision. Releases are published automatically from `v*` tags by `.github/workflows/release.yml` — see the [release checklist](AGENTS.md) (version in 3 manifests, README links + sizes, this file).

## [Unreleased]

### Added
- **Vitest suite** for the pure libs: `fsrs`, `derive`, `csv`, `markdown`, `session`, `backup` (`npm test`), and the release workflow now runs it before building.
- **Daily limits**: new-cards/day (default 20) and reviews/day (default 200) in Settings → FSRS Scheduler; budgets are respected by Study all and deck scopes.
- **Session summary**: cards, accuracy, lapses and time when a queue completes, with a one-click **Review lapses** queue.
- **Leech detection**: cards lapsed 6+ times get a dedicated sidebar/⌘K queue and an inspector flag.
- **Card history & lapse count** in the inspector (last 10 grades).
- **Backups**: JSON export/import with full scheduling state, plus automatic snapshots before clear/dedupe/restore and a Restore auto-backup button.
- **Unified Import sheet**: CSV, Chrome bookmarks HTML/JSON, paste-text (`Front :: Back`), and **Anki `.apkg`** import (desktop; decks become tag trees, intervals approximated).
- **Browse bulk mode**: multi-select with bulk suspend, reset scheduling and delete.
- **Images on cards**: paste an image into the editor (max 1.5 MB) and it renders inline.
- **Exam planner** on the dashboard: target date vs remaining new cards, with the required daily pace.
- **Global quick capture** `⌥⇧K` while the desktop app is running.
- **30-day pass rate** KPI in Analytics.

### Removed
- Camera **air gestures** and the bundled MediaPipe assets (~41 MB) — pointer drag and keyboard remain.
- **In-app widget window** and the macOS **WidgetKit widget** (the tray is the single desktop surface).
- **Pomodoro timer**, inspector **AI hints**, the inspector **scenario chart**, the sidebar **tag graph**, editor **template tabs**, the heuristic **AI card generator**, and the **cloud article import** (Zen/proxies/Firecrawl) — replaced by the file/paste/Anki import sheet.
- Direct Chrome bookmark file reads (permission-prone) and the unused Blind 75 CSV.

### Fixed
- **Data safety**: removed the silent SQLite→localStorage per-call fallback in `db.ts` (failures now surface instead of splitting data across stores), wrapped migrations/clear in transactions, and removed `@ts-nocheck`.
- **Review flow**: burying no longer desyncs the queue index; rapid key repeats can no longer double-grade a card and skip the next one; due learning cards no longer appear twice in one queue; undo restores the DB review row and session stats.
- **Security**: markdown link/cloze attributes are quote-escaped and a strict CSP is set (was `null`), closing an injection path from imported cards into Tauri IPC.
- **Seeding**: `Clear all data` is now durable (no re-seed on next launch); demo content is idempotent and no longer duplicates cards/reviews.
- **Editor**: advertised shortcuts now work (⌘↵ save, ⌃M/⌃⇧M math, ⌃⇧C cloze, ⌃F preview) and math/cloze buttons target the active tab.
- **Dates/analytics**: heatmap, streak and per-day charts use local calendar days; queue-bucket labels match their ranges.
- **Quick capture**: clipboard paste is now an explicit button instead of an automatic read.
- CSV parser handles quoted multi-line fields and maps headerless files as `front,back,tags`.

## [v0.5.0] — 2026-09-04 — "Visual overhaul"

### Changed
- **Design overhaul across the app**: one brand accent per theme (removed the second-accent drift), unified shape scale (cards 12px, overlays 16px, inputs 8px, pills), tighter section rhythm, Geist/Satoshi-first type stack (Inter dropped as default), stronger `prefers-reduced-motion` handling, solid-accent focus ring. Review keeps the same gestures and grading, with calmer hints and readout copy.
- **Copy cleanup**: no em/en dashes in UI strings, middle-dot separators capped at one per line, clearer empty states and tooltips.

### Fixed
- **Retention forecast chart stays in bounds**: the y-domain floor is now derived from the actual data minimum (snapped to 5%) instead of a hard 0.75, so decaying forecasts no longer draw past the axis. Grid ticks and the day axis follow the same scale.

## [v0.4.0] — 2026-09-02 — "Activity-aware sessions"

### Added
- **Activity-aware review sessions** (Settings → Activity): if you're idle mid-review (default 3 min, Off/1/3/5/10), the answer is auto-hidden, the pomodoro pauses, and a banner offers Resume / Restart queue / End. Sessions idle 15+ min auto-end (toggleable); returning from another window after the threshold applies the same treatment instantly. Any key/click/swipe resumes without grading the exposed card — every recorded grade stays a real recall.

## [v0.3.1] — 2026-09-02 — "Gesture map"

### Added
- **Gesture map** in review: a compact d-pad at the top-right of the card shows which direction maps to which grade (← Again · → Good · ↑ Easy · ↓ Hard), tap/pinch = flip; hover highlights and clicking a direction grades directly. Grade-bar zones now show their gesture arrows.

## [v0.3.0] — 2026-09-01 — "Gesture control"

### Added
- **Drag gestures on the review card**: grab the card and it follows the pointer with a tilt; release past the threshold to fly it out and grade (← Again · → Good · ↑ Easy · ↓ Hard), short drags spring back, a flick flips the card before reveal, click/tap toggles the answer. Directional badges light up live so you always see which grade you're committing to.
- **Camera air gestures** (opt-in, Settings → Gestures): MediaPipe HandLandmarker hand tracking runs entirely locally — raised-hand **pinch** flips the card, **air-swipes** grade it with the same 4-direction mapping. Picture-in-picture camera preview with live hand skeleton + status chip (tracking / camera denied / no camera / timeout watchdog).
- **macOS camera permission** wired up (`Info.plist` + camera entitlement) with a privacy-first usage description.
- **Offline gesture engine**: MediaPipe WASM + hand model bundled in the app (no network needed); without a camera the app degrades gracefully to keyboard/drag input.

### Changed
- Version 0.2.0 → 0.3.0 (all three manifests). Installers stay ≤ 25 MB.

### Notes
- MediaPipe assets committed under `public/mediapipe/` (wasm + `hand_landmarker.task`, ~7.8 MB model).

## [v0.2.0] — 2026-09-01 — "Recall" redesign

### Added
- **FSRS-5 scheduler**: stability/difficulty/retrievability per card, live interval predictions on the grading bar, desired-retention control (80–95%), per-grade projection curves in the inspector.
- **3-pane macOS glass shell**: collapsible translucent sidebar (decks / smart filters / tag graph), central canvas, collapsible FSRS+AI inspector. Vibrancy materials, hairline borders, layered shadows, 4 themes (Slate & Emerald / OLED & Amber, dark + light each, ⌘⇧T cycles).
- **Command bar (⌘K)**: fuzzy search across decks, cards, tags and actions; keyboard-first everything (Space reveal, 1–4 grade, G cloze reveal, H hints, ⇧G undo, ⌃→ skip, S/B suspend/bury, ⌘↵ end).
- **Cloze deletions + LaTeX**: Anki-style `{{c1::answer}}` with progressive per-block reveal (G), KaTeX rendering.
- **Dashboards & analytics**: 53-week streak heatmap, FSRS retention forecast, review-queue forecast, grade distribution, memory-load charts.
- **Quick capture (⌘⇧K)** and in-app **AI card generator drawer** (on-device, no API key).
- **Demo content**: 4 topic decks + ~90 days of review history.

### Changed
- Visual redesign across the whole app (tokens, hero KPIs, empty states, motion, responsive).

## [v0.1.0] — 2026-09-01 — Initial desktop release

### Added
- Tauri 2 desktop app with React 19 + TS + Vite: flashcard review with FSRS scheduler, SQLite (`revision.db`), single-deck model with tag trees.
- Keyboard-first review: Space reveal, 1–4 grade, G cloze reveal, H hints, ⇧G undo, ⌃→ skip, suspend/bury.
- System tray (`Due X • New Y`, Start Review / Show / Toggle Widget / Quit), launch-at-login, in-app 340×190 widget window.
- Native macOS WidgetKit desktop widget ("Due Today").
- Blind 75 seed (75 LeetCode questions) + 13 starter cards; CSV import/export; import Chrome bookmarks; article import with on-device Zen AI card generation.
- **Release pipeline**: GitHub Actions matrix build (macOS arm64 / x64 / Windows) — first version with installers + the release workflow.

[Unreleased]: https://github.com/xpressabhi/revision/compare/v0.5.0...HEAD
[v0.5.0]: https://github.com/xpressabhi/revision/releases/tag/v0.5.0
[v0.4.0]: https://github.com/xpressabhi/revision/releases/tag/v0.4.0
[v0.3.1]: https://github.com/xpressabhi/revision/releases/tag/v0.3.1
[v0.3.0]: https://github.com/xpressabhi/revision/releases/tag/v0.3.0