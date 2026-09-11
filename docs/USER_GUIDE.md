# Revision — User Guide

Everything you need to use the app day-to-day. For building from source see [DEVELOPMENT.md](DEVELOPMENT.md).

## Review workflow

Review queue order: **learning (10m step) → due → new** (new cards capped by your daily limit). The queue is scoped per deck/tag group from the sidebar or via ⌘K `study …` actions.

| Stage | What you do |
|---|---|
| Card hidden (front) | Recall the answer, then **flip** (Space, click the card or flick it) |
| Card shown (back) | **Grade** with `1–4` or a swipe — the grading bar shows the FSRS interval before you commit |
| After grading | Next card; `⇧G` undoes the last grade, `⌃→` skips, `E` edits, `S`/`B` suspend/bury |

When the queue finishes you get a **session summary**: cards, accuracy, lapses and elapsed time, plus **Review lapses** to drill just the cards you failed. **Study more** re-derives the queue.

**Step-away handling** (Settings → Activity, default 3 min): if you're idle while a card is shown, the answer is auto-hidden and a banner offers **Resume** (same queue), **Restart queue** (re-derived) or **End**. Sessions idle for 15 min end automatically — the queue is re-derived next time. Turning the threshold to **Off** disables it. Any key, click or swipe resumes without acting on the hidden card.

## Study limits & leeches

- **Daily limits** (Settings → FSRS Scheduler): "New cards per day" (default 20) and "Reviews per day" (default 200). Limits apply to Study all and deck scopes; explicit smart filters and leech/review-lapse queues always show everything.
- **Leeches**: cards you've lapsed 6 or more times appear in the sidebar's **Leeches** queue. Rewrite or suspend them.
- **Card history**: the inspector lists the last 10 grades for the current card plus its lifetime lapse count.

## Gestures

Drag and camera-free pointer gestures use one grade mapping:

| Direction | Grade |
|---|---|
| ← left | **Again** (1) |
| → right | **Good** (3) |
| ↑ up | **Easy** (4) |
| ↓ down | **Hard** (2) |

- **Click / tap** the card — flip (pressing again flips back)
- **Flick** the card any direction before reveal — reveals the answer
- **Grab & drag** a shown card — it follows the pointer with a tilt, grade badges light up as you drag; release past the glow to *fly it out and grade*, release short to *spring back* with no effect
- Drags ignore links/buttons inside the card; on touch screens vertical swipes scroll instead of grading
- Drag grading needs no on-screen pad: flick the card or use the grade bar (the map is in the `?` overlay).

## Keyboard map (core)

| Keys | Action |
|---|---|
| `⌘K` | Command bar (decks, cards, actions) |
| `⌘⇧K` | Quick capture |
| `⌥⇧K` | Quick capture from anywhere (desktop app, global) |
| `Space` / `↵` | Reveal answer (press again to grade Good) |
| `1 2 3 4` | Grade: Again · Hard · Good · Easy (FSRS predictions show live) |
| `G` | Reveal next cloze block |
| `⇧G` | Undo last grade |
| `⌃→` | Skip card |
| `E` / `S` / `B` | Edit / Suspend / Bury |
| `⌘1–5` | Study · Browse · Review · Progress · Settings |
| `⌘S` | Sidebar: full → rail → hidden |
| `⌥⌘I` | Toggle inspector |
| `⌘⇧F` | Focus mode |
| `⌘⇧T` | Cycle theme |
| `⌘⌃1–3` | Density: relaxed / standard / compact |
| `⌘,` | Settings |
| `/` or `?` | Keyboard-map overlay |

Review keeps the screen minimal: the four grade buttons with their FSRS intervals, Undo and End. Skip, Edit, Bury and Suspend live in the `···` menu (their keyboard shortcuts still work).

## Importing

One sheet (⌘K → Import cards, the Browse `···` menu, or Settings → Data) covers every format:

- **CSV / bookmarks**: drop or pick a file. Revision CSV, Chrome bookmarks HTML (`Bookmarks.html`) and bookmarks JSON are detected automatically.
- **Paste text**: one card per line, `Front :: Back` (or a tab between them).
- **Anki** (desktop app): pick an `.apkg` export or a raw `collection.anki2`/`collection.anki21`. Decks become tag trees; review cards keep an interval derived from Anki's own interval; lapses/grades are not imported.

CSV format (header optional but recommended):

```
deck,front,back,tags
"DSA / LeetCode","Two Sum — Pattern?","**Pattern:** Hash Map ...","array, hashmap"
```

Images: paste an image directly into the editor textarea (max 1.5 MB) — it's stored inline in the card.

## Backup & restore

- **Export backup** (Settings → Data) writes a JSON file with every card, its full FSRS state and all review history.
- **Import backup** restores that file; current data is snapshotted first.
- **Restore auto-backup** rolls back to the snapshot taken automatically before the last clear/dedupe/restore.
- CSV export is for spreadsheets; it does **not** include scheduling state.

## Sync between desktop and web app

Web app: **https://dailyrevision.vercel.app** (or your own Vercel deploy). Both apps are local-first; they meet in a single JSON file you keep wherever you like (Documents, iCloud Drive, Dropbox…).

1. **Desktop**: Settings → Data → Sync → **Attach sync file…** → choose or create e.g. `revision-sync.json`.
2. **Web** (Settings → Data → Sync): **Attach sync file…** and pick the same file. Chrome/Edge keep write access; Safari/Firefox show Export and Import/merge buttons instead.
3. Click **Sync now** on either side — it reads the file, merges, and writes the result back. Change the file or detach any time.

Merge rules: cards are matched by a stable id, the newest content edit wins, scheduling state is taken from the most recent review, review history is unioned (no duplicates), and deletions propagate. When you have no attached file, use **Export sync file** and **Import / merge sync file** to move data manually.

## DB location

- **Tauri app**: app data dir — e.g. `~/Library/Application Support/com.revision.app/revision.db` (macOS). Use **Export backup** for a safe copy.
- **Web app / browser preview**: IndexedDB database `revision` (cards, states, reviews, decks). Older browser builds stored JSON in `localStorage` under `revision_*`; it is imported into IndexedDB automatically on first launch. Clear site data to reset.

## Tray, autostart & updates

- **Tray (always visible):** `Due X • New Y` tooltip, menu with `▶ Start Review`, `Show Revision`, `Quit`. Live-updates on every stats refresh.
- **Launch at login:** Settings toggle (macOS LaunchAgent).
- **From GitHub**: download the newest installer from the [README download table](../README.md#download--install) — a Release is published automatically on every `v*` tag push.
- **From this repo** (no rebuild needed for local tweaks):

```bash
npm run tauri:build:install   # builds (debug), copies .app to /Applications, relaunches
```
