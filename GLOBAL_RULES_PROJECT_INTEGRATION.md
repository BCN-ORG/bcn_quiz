# Global Engineering Rules — Project Integration

## Canonical Global Source

`~/.ai-guidance/ENGINEERING_PRINCIPLES.md` remains the canonical global guidance. Neither workspace nor repository files copy its full content. They require agents to read it when available and add only BCN service/domain constraints.

## Existing Global Agent Integrations

| Agent | Existing global integration | Audit |
| --- | --- | --- |
| Codex | `~/.codex/AGENTS.md` | Regular file; points to the canonical guidance. |
| Cursor | `~/.cursor/rules/engineering-principles.md` | Regular global rule; points to the canonical guidance. |
| Antigravity | `~/.gemini/config/plugins/engineering-governance/rules/AGENTS.md` | Plugin rule exists and points to the canonical guidance. |
| Claude Code | `~/.claude/CLAUDE.md` | Symlink to the third-party Karpathy guidance; target exists. Left untouched. |

Before this task, `bcn_system/` and `bcn_quiz/` had no `AGENTS.md`, `CLAUDE.md`, Cursor project rules or Antigravity workspace rules. Existing README files are project documentation; `.github/workflows/` is CI configuration; `bcn_system/.cursor/mcp.json` configures MCP connections, not project rules. There was no `CONTRIBUTING.md` or `AI_PROJECT_CONTEXT` in this workspace audit.

## Project Rules Added

- `bcn_system/AGENTS.md`: global baseline, Profiles/Quiz service ownership, cross-repo scope and data safety. `bcn_system` is a workspace directory, **not** a Git repository; this file must be managed separately if the workspace is recreated elsewhere.
- `bcn_quiz/AGENTS.md`: Quiz stack, Profiles identity contract, Course–Topic–Quiz–Option model, progress isolation, exact leaderboard score/order/timezone/snapshot rules, notification persistence/SSE/dedup, API/frontend/security conventions, actual commands and verification expectations. It is the portable project source of truth inside the Quiz Git repository.

No nested backend/frontend AGENTS files were needed: the domain rules apply to both applications.

## Codex Integration

Codex has the existing user-level `~/.codex/AGENTS.md` and now finds `bcn_system/AGENTS.md` and `bcn_quiz/AGENTS.md` along the repository path. No global Codex file changed. `codex doctor --summary --no-color` completed with 22 OK, 2 notes, 2 warnings, 0 failures; the warnings concerned local config/`TERM=dumb`, not these files. A newly started Codex session has not been independently inspected for its loaded instruction list.

## Cursor Integration

`bcn_quiz/.cursor/rules/project-instructions.mdc` is an always-applied project rule directing Cursor to the repository AGENTS.md and, when present, the parent workspace AGENTS.md. It adds no second copy of domain rules. Cursor documents `.cursor/rules/*.mdc`, `alwaysApply`, and nested project rules at https://docs.cursor.com/context/rules . The Cursor IDE rule list was not opened in a fresh session here.

## Antigravity Integration

`bcn_system/.agents/rules/bcn-system.md` handles a workspace opened at `bcn_system`; `bcn_quiz/.agents/rules/bcn-quiz.md` handles Quiz opened as its own workspace. Both direct Antigravity to the same AGENTS files. Google's Antigravity guide documents workspace rules under `.agents/rules/`: https://codelabs.developers.google.com/getting-started-agy-ide . Existing global plugin files were not changed. The Antigravity Rules UI was not opened in a fresh session here.

## Claude Code Status

The global `~/.claude/CLAUDE.md` remains a valid third-party symlink and was not overwritten. A new `bcn_quiz/CLAUDE.md` imports `@AGENTS.md` using Claude Code's documented import mechanism, so project rules load without duplicating them. Claude Code documents this behavior at https://code.claude.com/docs/en/memory . Claude CLI was not installed on PATH, so runtime `/context` or `/doctor prompt-audit` was not run.

## Conflict Check

Global rules remain the baseline; project files only specify BCN ownership, domain contracts and real verification commands. The Claude third-party guidance asks for small, verifiable changes and does not materially conflict with them. All new adapter files point to AGENTS.md rather than redefining scoring, auth or Git policy. No existing user configuration, symlink, project code or uncommitted feature work was overwritten.

## Verification

- Confirmed all new files and canonical global files exist; Claude global symlink target exists; no broken symlink found in new adapter directories.
- Confirmed the command names against `be/package.json` and `fe/package.json`; noted that backend `npm run lint` includes `--fix`.
- Confirmed `git diff --check` for Quiz and Profiles. This documentation-only task did not require application tests, migrations or browser smoke.
- Codex doctor: 22 OK, 0 failures. Cursor/Antigravity/Claude rule loading in fresh sessions: **NOT VERIFIED**.

## Files Changed

- Workspace outside Git: `bcn_system/AGENTS.md`, `bcn_system/.agents/rules/bcn-system.md`.
- Quiz Git repository: `AGENTS.md`, `.cursor/rules/project-instructions.mdc`, `.agents/rules/bcn-quiz.md`, `CLAUDE.md`, `GLOBAL_RULES_PROJECT_INTEGRATION.md`.

## Final Status

**PARTIAL** — instruction files and adapters are in place and statically checked. Fresh Cursor, Antigravity and Claude sessions still need their rule/context views checked; the parent workspace files also need separate versioning if they must travel with new clones.
