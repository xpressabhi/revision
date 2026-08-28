# Principal Prep — Revision Workspace

This workspace contains the **Principal Prep** desktop app — a Tauri + SQLite active-recall tool for DSA, System Design, AI, and Behavioral prep.

- App lives in `prep-app/` — see `prep-app/README.md` for run instructions.
- Quick start:
  ```bash
  cd prep-app
  npm install
  npm run tauri dev   # desktop (SQLite prep.db)
  # or
  npm run dev         # browser preview (localStorage fallback)
  ```

Built for personal, offline, local-first study. No cloud sync. One `prep.db` file you own.
