# AGENTS.md

This file guides Codex-style agents working in this repo.

## How to use this file effectively
- Read this file first before editing scripts.
- Prefer small, targeted changes; avoid refactors unless asked.
- Keep scripts readable; add short comments only when logic is non-obvious.
- Preserve existing Tampermonkey metadata blocks (`// ==UserScript==`).
- When adding a new script, update `readme.md` with its purpose and scope.
- If you touch script URLs, also update `update_script_urls.sh` if needed.
- Validate changes by reasoning through the target site flow; run tests only if asked.

## Repo notes
- Scripts live at repo root; filenames are descriptive.
- Use ASCII only unless the script already includes Unicode.
- Do not remove user changes you did not make.
