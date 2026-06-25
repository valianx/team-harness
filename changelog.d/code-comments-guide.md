### Added
- `docs/code-comments.md`: consolidated code-comments contract — audience-visibility axis, per-surface KEEP/CUT/EXCEPTION tables (Go installer / Bash+TS hooks / agent-skill Markdown), rationale-routing decision tree, load-bearing exceptions list, and enforcement note. Sibling to `docs/voice-guide.md`.

### Changed
- `agents/implementer.md`: bug-fix allowed comment form changed from `// fix(area-#N): {why}` to `// {why}` (issue-ID token dropped; issue linkage stays in the commit and PR). Forbidden-cruft list added to the comment guidance (no workspace/phase/stage/step/task/issue-ID/session comments) with pointer to `docs/code-comments.md`. Reviewability checklist extended to catch work-narration/session-cruft comments.
- `agents/review-lenses/comment-rot.md`: work-narration/session-cruft trigger patterns added to `## When this lens fires`; new `### Work-narration and session cruft` subsection under `## What to look for`; SUGGESTION-severity row added to the severity table.
- `agents/review-lenses/_index.md`: `comment-rot` trigger column extended with the new work-narration/session-cruft patterns (kept in sync with lens body and reviewer table).
- `agents/reviewer.md`: `comment-rot` trigger column in the lens table extended with the new work-narration/session-cruft patterns (kept in sync with lens body and `_index.md`).
- `CLAUDE.md §6.5`: prohibition bullet added — no work-narration/session-cruft comments in committed files.
- `CLAUDE.md §9`: positive-pattern pointer added — self-documenting code first; WHY not WHAT; rationale to `/docs`.
