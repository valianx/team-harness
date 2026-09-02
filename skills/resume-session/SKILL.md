---
name: resume-session
description: Brief from a saved session handoff (REPORT-only — reads and reports, touches no files, dispatches no agent).
---

Produce a briefing from a saved session handoff so the operator can decide how to
continue. This skill runs directly and does NOT invoke the orchestrator or any other
agent. It writes NO file and dispatches NO agent. It reads the handoff and reports;
the operator acts.

Analyze the input: $ARGUMENTS

---

## Step 0 — Resolve workspaces path

Read `~/.claude/.team-harness.json`. If it exists and `logs-mode` is `"obsidian"`,
use `{logs-path}/{logs-subfolder}/{repo-name}` as the base path (where `repo-name`
is the basename of the current working directory). If `logs-mode` is `"local"` or
the file is missing, use `workspaces/` (relative to cwd). Replace all `workspaces/`
references below with the resolved path.

Resolve `scripts/resolve-workspace.mjs` relative to this skill's own directory,
falling back to `./skills/resume-session/scripts/resolve-workspace.mjs` in a
repository checkout. Run it read-only with the absolute base path and the
operator's feature argument:

```bash
node "$RESUME_WORKSPACE_HELPER" --base "$RESOLVED_PATH" --feature "$FEATURE"
```

The helper accepts an exact workspace directory name or a logical feature. A
logical feature discovers immediate real directories named
`{YYYY-MM-DD}_{feature}` as well as a legacy exact directory. One match resolves;
multiple matches are ambiguous and MUST be presented for an exact operator
choice. Never choose the newest match, follow a symlink, use a recursive search,
or compose `{resolved-path}/{feature}` after the helper returned another path.

---

## Step 1 — Read the handoff (read-only)

Read the helper's exact `handoff` path (read-only).

Also read its exact `state` path (read-only) for phase and status
context.

If discovery is `ambiguous`, list only the candidate directory names and ask the
operator to rerun with one exact name. If it is `not-found`, report that no
matching workspace exists; do not recommend `save-session`, because creating a
new path is outside this read-only skill. If discovery is `handoff-missing`,
report the exact existing workspace and missing handoff path; never recommend a
logical-name save that could create an undated parallel workspace. Then stop —
do not write anything.

The three required field anchors in a valid handoff are:
- `### What Worked`
- `### What NOT to Retry`
- `### Next Step`

If any of these anchors is absent from the handoff file, note the missing field in
the briefing and continue.

---

## Step 2 — Emit the briefing (REPORT-only)

Render the three fields for the operator:

```
=== Session Handoff: {workspace_name} ===

Phase / Status (from 00-state.md): {phase} / {status}

What Worked
-----------
{content}

What NOT to Retry
-----------------
{content}

Next Step
---------
{content}
```

Touch no files during or after this step.

---

## Step 3 — Offer the operator a short continuation choice

End the briefing with concise stable options:

```text
1 — continue the pipeline now
2 — implement the Next Step directly
3 — stop here
```

Numbers are shortcuts, not required command syntax. Tell the operator that a short unambiguous
reply is sufficient and that this briefing made no file changes. Never instruct the operator to
enter a runtime-specific recovery command. This report-only turn takes no action; on the next live
reply, the coordinator binds the choice to this exact `{workspace_name}` presentation and routes
continuation internally to the recovery capability installed in the active runtime.

---

## REPORT-only Boundary

**HARD boundary:** `resume-session` never writes a file. It never dispatches the
orchestrator or any agent. There is no `--apply` path, no `--fix` path, and no
auto-write path of any kind. The skill reads `00-session-handoff.md` and
`00-state.md` (both read-only) and emits the briefing. Nothing else happens until the operator
replies. A later affirmative reply is a new coordinator turn, not an action performed by this
report-only skill.

If a future request asks this skill to write a file, dispatch an agent, or resume
the pipeline automatically, that request falls outside this skill's scope and must
be declined.

---

## Voice

See `agents/_shared/operational-rules.md` § "Voice" and § "Language register" for the full
voice and dialect-neutrality contract. It applies to every response this skill produces —
chat replies, status blocks, error messages, and self-corrections alike.

## Output Discipline

Silent on file reads and path resolution. Present only:
1. The briefing block (Step 2).
2. The continuation choices (Step 3).

No intermediate status narration, no tool-call commentary, no internal chatter.
