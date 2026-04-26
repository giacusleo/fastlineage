# Agent Notes

This folder is reserved for lightweight Markdown notes used for AI-assisted development and maintainer handoffs.

Keep it `.md`-only so it stays easy to scan, diff, and ignore if you are only here for the extension itself.

## How it is used

- `.agent/CONTEXT.md` is the current handoff for the next agent session: short, actionable, no history.
- `.agent/WORKLOG.md` is append-only and records what changed and why.
- After each meaningful batch of work, update both files so the next session has current context without reading the full git history.
