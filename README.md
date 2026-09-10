# Revision — Active Recall (Tauri + SQLite)

[![Release](https://img.shields.io/github/v/release/xpressabhi/revision?label=latest%20release&style=flat-square)](https://github.com/xpressabhi/revision/releases/latest)
[![Build](https://github.com/xpressabhi/revision/actions/workflows/release.yml/badge.svg)](https://github.com/xpressabhi/revision/actions/workflows/release.yml)

Local-first desktop app for principal-level interview prep. **FSRS-5 spaced repetition** for **DSA / System Design Concepts / System Design Use Cases / AI Concepts / AI Use Cases / Behavioral** — a keyboard-first, glassmorphic macOS app with drag gestures.

> Core features work fully offline: single SQLite file `revision.db` (Tauri) or `localStorage` (browser preview). No account, no telemetry, no network. Everything imports a file you pick; nothing is uploaded.

---

## Download & Install

Latest: **v0.6.0** — releases are built automatically from `v*` tags (see [releases](https://github.com/xpressabhi/revision/releases)). See [CHANGELOG.md](CHANGELOG.md) for what's new per version.

| Platform | Installer | Size |
|---|---|---|
| macOS Apple Silicon (M1/M2/M3/M4) | [Revision_0.6.0_aarch64.dmg](https://github.com/xpressabhi/revision/releases/latest/download/Revision_0.6.0_aarch64.dmg) | 8.1 MB |
| macOS Intel | [Revision_0.6.0_x64.dmg](https://github.com/xpressabhi/revision/releases/latest/download/Revision_0.6.0_x64.dmg) | 8.3 MB |
| Windows | [Revision_0.6.0_x64-setup.exe](https://github.com/xpressabhi/revision/releases/latest/download/Revision_0.6.0_x64-setup.exe) · [.msi](https://github.com/xpressabhi/revision/releases/latest/download/Revision_0.6.0_x64_en-US.msi) | 5.2 MB · 6.7 MB |

Tiny app — every installer is under 9 MB (the old 41 MB MediaPipe bundle is gone).

macOS: open the .dmg and drag Revision to Applications (first launch: right-click → Open if Gatekeeper complains — the app is signed with ad-hoc signatures only). Windows: run the installer.

## Features

- **FSRS-5 scheduler**: live interval predictions on the grading bar, desired-retention control (80–95%), daily new/review limits, per-grade projections in the inspector
- **Review by gestures**: grab the card to flip or grade it (← Again · → Good · ↑ Easy · ↓ Hard), or use the keyboard
- **Session summary**: cards, accuracy, lapses and time on completion, with one-click "review lapses"
- **Leech detection**: cards that lapse 6+ times surface as a "Leeches" queue
- **Card history**: every grade per card is listed in the inspector
- **Backups**: export/import full JSON state (scheduling included) plus automatic pre-destructive snapshots
- **Keyboard-first everything**: Space reveal, 1–4 grade, G cloze reveal, ⇧G undo, ⌃→ skip, ⌘K command bar, global ⌥⇧K quick capture (desktop)
- **Cloze deletions + LaTeX + images**: `{{c1::answer}}` progressive reveal, KaTeX rendering, paste images into cards
- **Dashboards & analytics**: 53-week streak heatmap, retention forecast, grade mix, 30-day pass rate, exam-date planner
- **Tray**: `Due X • New Y` menu-bar tray with Start Review, launch-at-login
- **Imports**: CSV, Chrome bookmarks (HTML/JSON), paste text, and Anki `.apkg` decks
- Single-deck data model with tag trees; Browse with search, filters and bulk actions

## Screenshots

| | |
|---|---|
| **Dashboard** — due today, streak heatmap thumbnails, smart study queues | **Review** — front of card with the gesture map (← Again · → Good · ↑ Easy · ↓ Hard) |
| <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="560"> | <img src="docs/screenshots/review-hidden.png" alt="Review — front" width="560"> |
| **Review (shown)** — answer side with the FSRS prediction grading bar | **Browse** — search, filters, inline edit |
| <img src="docs/screenshots/review-shown.png" alt="Review — answer + grading bar" width="560"> | <img src="docs/screenshots/browse.png" alt="Browse" width="560"> |
| **Analytics** — retention forecast, heatmap, grade distribution | |
| <img src="docs/screenshots/analytics.png" alt="Analytics" width="560"> | |

## Docs

| Doc | What's inside |
|---|---|
| [User guide](docs/USER_GUIDE.md) | Keyboard map, gestures, daily limits, backups, imports (CSV/bookmarks/Anki), DB location, tray/autostart, updates |
| [Development](docs/DEVELOPMENT.md) | Stack, run/build commands, project layout, release process |
| [Changelog](CHANGELOG.md) | Release history |

## License

MIT — personal use.