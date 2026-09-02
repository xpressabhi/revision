# PLAN — Activity-aware review sessions (idle / step-away handling)

Tracker for the idle/stale session feature. Tick boxes as work lands. Status last updated: 2026-09-02.

## Problem

If the user steps away mid-review (card shown, no interaction, window hidden), the app currently does nothing: the answer stays exposed, grading a leaked answer pollutes the review log (self-grading bias → corrupts future FSRS weight optimization), the pomodoro keeps "focusing", and the queue snapshot resumes as if fresh.

FSRS math stays honest (r is computed at grade time) — the fix targets **grade signal quality + UX honesty**, not scheduler formulas.

## Requirements

- [x] Detect real inactivity: no interaction AND (time elapsed OR window hidden)
- [x] Never corrupt an in-progress drag (pointermove counts as activity)
- [x] On stale: hide the answer, pause pomodoro, show overlay with Resume / Restart queue / End
- [x] After a long stale (< 15 min): auto-end the session with a toast
- [x] Opt-out toggle + threshold selector (Off/1/3/5/10 min, default 3)
- [x] Zero data migration
- [x] Clock-controllable for tests (Date.now-based, not performance.now)

## Design

### State machine

```
ACTIVE ──(no touch for T1)──► STALE ──(no touch for T2)──► ENDED (auto-end)
  ▲                              │
  └── touch / resume ────────────┘ (restart queue = re-derive)
```

- T1 = staleness threshold (default 3 min) · T2 = auto-end (default 15 min, toggleable)
- Sweep interval 5 s while a review session exists; immediate staleness check on window focus-return if away ≥ T1

### Stale behavior (T1)

- [x] `shown: false`, `revealed: 0`, `hintLevel: 0` — answer hidden, cloze re-armed
- [x] Pomo `running: false`
- [x] `stale: true` → ReviewView banner: "Stepped away? Answer hidden — recall it fresh"
  - Resume → same queue/idx/stats/undo preserved
  - Restart queue → fresh `startReview(review.scope)` (re-derives from live state)
  - End session → existing endReview
  - Any interaction touch auto-clears stale (banner click / any key / any pointer)

### Auto-end (T2)

- [x] `endReview()` + toast "Stepped away — session ended; queue re-derived on next start"
- [x] Guard: never fires on the session-complete screen (`idx >= queue.length`)

### Signals

- [x] Pointer: capture-phase `pointerdown` + `pointermove` on document while a session exists
- [x] Keyboard: touch at top of the review branch of the master keydown handler; any key while stale = resume
- [x] Camera air gestures: explicit touch in the HandOverlay `onFlip`/`onGrade` wrappers (no pointer events involved)
- [x] Window: `visibilitychange` + `blur`/`focus` — record away time; on return, if away ≥ T1 apply stale immediately

## Files

- [x] `src/lib/session.ts` (new) — `StaleThreshold`, `STALE_OPTIONS`, `STALE_DEFAULT`, `AUTO_END_DEFAULT_MIN`, `isStale`, `isAutoEnd` (pure, Date.now-based)
- [x] `src/App.tsx` — `stale` on ReviewState; `lastTouchRef`; `noteActivity`; `flipCard`; `markStale`; `endReview` (stable); sweep effect; visibility effect; pointer listeners; keydown touch; settings state (`recall_stale_min`, `recall_stale_autoend`); ReviewView + SettingsView props
- [x] `src/components/ReviewView.tsx` — `stale`/`onResume`/`onRestart` props; stale banner UI (z-index below hand overlay)
- [x] `src/App.css` — `.stale-banner` styles
- [x] `src/components/SettingsView.tsx` — "Activity" card: step-away threshold segmented control + auto-end toggle
- [x] `docs/USER_GUIDE.md` — "Step-away handling" subsection
- [x] `CHANGELOG.md` — `[Unreleased]` entry
- [x] `docs/DEVELOPMENT.md` — note the PLAN-* tracker convention

## Verification

- [x] `npm run build` (tsc gate)
- [x] Playwright + `page.clock.fastForward`:
  - stale after 4 min idle → banner, answer hidden, pomo paused, no grade
  - Resume keeps queue; Restart re-derives
  - auto-end at 15 min → dashboard + toast
  - threshold Off → nothing after 20 min
  - blur → 4 min → focus → immediate stale
- [x] Manual: real app, walk away 3 min with a card shown, come back

## Decisions (defaults)

- T1 = 3 min · T2 = 15 min · auto-end on · applies even when card is hidden (hygiene)
- `Off` fully disables the mechanism