# Revision — User Guide

Everything you need to use the app day-to-day. For building from source see [DEVELOPMENT.md](DEVELOPMENT.md).

## Review workflow

Review queue order: **learning (10m step) → due → new** (new cards capped at 20 per session). The queue is scoped per deck/tag group from the sidebar or via ⌘K `study …` actions.

| Stage | What you do |
|---|---|
| Card hidden (front) | Recall the answer, then **flip** (Space, click the card or flick it) |
| Card shown (back) | **Grade** with `1–4` or a swipe — the grading bar shows the FSRS interval before you commit |
| After grading | Next card; `⇧G` undoes the last grade, `⌃→` skips, `E` edits, `S`/`B` suspend/bury |

## Gestures

Both pointer-drag and camera air gestures use the same grade mapping:

| Direction | Grade |
|---|---|
| ← left | **Again** (1) |
| → right | **Good** (3) |
| ↑ up | **Easy** (4) |
| ↓ down | **Hard** (2) |

**Drag (always on, desktop/touch):**

- **Click / tap** the card — flip (pressing again flips back)
- **Flick** the card any direction before reveal — reveals the answer
- **Grab & drag** a shown card — it follows the pointer with a tilt, grade badges light up as you drag; release past the glow to *fly it out and grade*, release short to *spring back* with no effect
- Drags ignore links/buttons inside the card; on touch screens vertical swipes scroll instead of grading
- A **gesture map** (compact d-pad) floats at the top-right of the card during review — arrows show which direction maps to which grade (← Again · → Good · ↑ Easy · ↓ Hard), the center shows tap/pinch = flip, and the caption switches between “tap to reveal” and “grade”. Hover to highlight, click a direction to grade it directly.

**Air gestures (opt-in, Settings → Gestures → “Air gestures (camera)”):**

- Camera + hand tracking run **entirely locally** (bundled MediaPipe model, ~7.8 MB) — nothing is uploaded
- Raise your hand into view: **pinch** (thumb + index tips) flips the card; **air-swipes** ←/→/↑/↓ grade with the mapping above
- A picture-in-picture preview shows the camera feed with a live hand skeleton; the status chip says whether your hand is tracked and flashes the recognized gesture (“PINCH ✓”, “→ GOOD”)
- macOS asks for camera permission once (System Settings → Privacy & Security → Camera if you denied it)
- No camera (or denied/slow)? The overlay says so and everything still works with keyboard/drag

## Keyboard map (core)

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

## CSV format (import/export)

Header optional but recommended:

```
deck,front,back,tags
"DSA / LeetCode","Two Sum — Pattern?","**Pattern:** Hash Map ...","array, hashmap"
```

## DB location & backup

- **Tauri app**: app data dir — e.g. `~/Library/Application Support/com.revision.app/revision.db` (macOS). Use **Export CSV** to back up.
- **Browser preview**: `localStorage` keys `revision_cards`, `revision_states`, etc. Clear site data to reset.

## Tray, widgets & autostart (no terminal needed)

- **Tray (always visible):** `Due X • New Y` tooltip, menu with per-deck breakdown, `▶ Start Review`, `Show Revision`, `Toggle Widget`, `Quit`. Live-updates on every stats refresh.
- **In-app widget window:** 340×190 transparent always-on-top; toggle from tray or Settings.
- **macOS Desktop Widget (WidgetKit):** Desktop → right-click → Edit Widgets → search “Revision” → add “Due Today”. Reads `revision.db` directly.
- **Launch at login:** Settings toggle (macOS LaunchAgent).

## Updates

- **From GitHub**: download the newest installer from the [README download table](../README.md#download--install) — a Release is published automatically on every `v*` tag push.
- **From this repo** (no rebuild needed for local tweaks):

```bash
npm run tauri:build:install   # builds (debug), copies .app to /Applications, embeds widget, relaunches
```