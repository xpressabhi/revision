# Changelog

All notable changes to Revision. Releases are published automatically from `v*` tags by `.github/workflows/release.yml` — see the [release checklist](AGENTS.md) (version in 3 manifests, README links + sizes, this file).

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

[Unreleased]: https://github.com/xpressabhi/revision/compare/v0.3.1...HEAD
[v0.3.1]: https://github.com/xpressabhi/revision/releases/tag/v0.3.1
[v0.3.0]: https://github.com/xpressabhi/revision/releases/tag/v0.3.0