# Principal Prep — Active Recall (Tauri + SQLite)

Local-first desktop app for principal-level interview prep. Spaced repetition for **DSA / System Design Concepts / System Design Use Cases / AI Concepts / AI Use Cases / Behavioral**.

> Works fully offline. Single SQLite file `prep.db` (Tauri) or `localStorage` (browser preview). No cloud, no account.

### Features
- 6 pre-seeded decks, generic Front/Back cards with markdown + code blocks + tags
- Spaced repetition via SM-2: Again (10m) / Good (1d) / Easy (3d+) — stored in `card_state`
- Review queue: due + up to 20 new cards, keyboard `Space` to reveal, `1` `2` `3` to grade
- Browse: search front/back/tags, filter by deck/state, edit/delete
- Import/Export CSV: `deck,front,back,tags` — drag or button
- Seed 13 starter cards covering all pillars
- SQLite: `prep.db` in app data dir (Tauri) via `tauri-plugin-sql`, WAL + FK enabled

### Stack
- **Tauri 2** + **React 19** + **TypeScript** + **Vite 7**
- **Rust** backend: `tauri-plugin-sql` (sqlite), `dialog`, `fs`
- Frontend DB abstraction: `src/lib/db.ts` — auto-falls back to `localStorage` when run as plain web (`npm run dev`) so you can preview without Tauri
- Styling: custom CSS (no Tailwind), responsive, dark sidebar

### Run
```bash
cd prep-app
npm install
# Desktop (Tauri) — recommended
npm run tauri dev        # opens native window, uses SQLite prep.db

# Or preview in browser only (uses localStorage, no Rust needed)
npm run dev              # http://localhost:1420 — good for UI iteration

# Build native binary
npm run tauri build      # .dmg / .exe / .AppImage in src-tauri/target/release/bundle/
npm run build            # web build only -> dist/
```

### DB Location
- Tauri: app data dir — e.g. `~/Library/Application Support/com.principal.prep/prep.db` (macOS). Portable: `Export CSV` to backup.
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
prep-app/
  src/
    App.tsx                 # 3 views: Today / Review / Browse + modals
    lib/db.ts               # SQLite + localStorage fallback
    lib/db.browser.ts       # localStorage impl
    lib/srs.ts              # SM-2 nextState()
    lib/types.ts, csv.ts, seed.ts, markdown.tsx
    App.css                 # design system
  src-tauri/
    Cargo.toml, tauri.conf.json, capabilities/default.json
  public/
```

### Tauri Setup
Requires Rust 1.70+ and system deps (Xcode CLI tools on macOS). No extra config — `tauri-plugin-sql` with `sqlite` feature already added.

### License
MIT — personal use.
