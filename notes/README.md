# Notes

This folder is reserved for lightweight, human-readable Markdown notes used during development (context handoffs, decisions, work logs).

Keep this folder `.md`-only so it stays easy to scan and diff.

## “.md cycle” (how I’ll work)

- `notes/CONTEXT.md` is the **single, current** context handoff for any agent: short, actionable, no history.
- `notes/WORKLOG.md` is **append-only** and records what changed + why (chronological).
- After each meaningful batch of work (a UX tweak, refactor, bugfix, etc.), I update:
  - `notes/WORKLOG.md` (append)
  - `notes/CONTEXT.md` (update + append a brief “Recent agent actions” line)

