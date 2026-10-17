
Produce a briefing from a saved session handoff so the operator can decide how to
continue. This skill runs directly and does NOT invoke the orchestrator or any other
agent. It writes NO file and dispatches NO agent. It reads the handoff and reports;
the operator acts.

Analyze the input: $ARGUMENTS

---

## Step 0 — Resolve the retained context

Use [workspace](../workspace/SKILL.md) read-only. Reuse the bound locator and verified
source association before defaults, checkout names or dates. For remote context,
Main reads exact retained IDs using native tools and supplies verified candidates
to exported `resolveContextWorkspace({binding,remoteCandidates,listingComplete})`.
It returns a logical handoff reference, never creates Pages or requires local state.
Preserve missing, ambiguous, incomplete, unavailable or conflicting bindings and
report the pending reason; do not substitute a new Page or local home.

Bound file context delegates to the unchanged file resolver. Unbound file lookup
uses the CLI below with the configured owning-project base and requested feature.
Do not infer ownership from the checkout basename.

For file contexts only, resolve `scripts/resolve-workspace.mjs` relative to this directory,
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

Read the exact file handoff or selected Page's logical handoff on its selected
stream. Verify its locator and source association; title alone is insufficient.
For older context, establish the association from linked plan/source evidence or
report the missing association. Read phase/status from the plan or optional file
`state` path; a missing `00-state.md` is not a remote error.

For file discovery, if `ambiguous`, list candidate directory names and ask the
operator to rerun with one exact name. If it is `not-found`, report that no
matching workspace exists; do not recommend `save-session`, because creating a
new path is outside this read-only skill. If discovery is `handoff-missing`,
report the exact existing workspace and missing handoff path; never recommend a
logical-name save that could create an undated parallel workspace. Remote errors
report the retained Page IDs/URL and precise pending reason. Any unresolved lookup
stops without mutation.

The three required field anchors in a valid handoff are:
- `### What Worked`
- `### What NOT to Retry`
- `### Next Step`

If any of these fields is absent from the handoff, note the missing field in
the briefing and continue.

---

## Step 2 — Emit the briefing (REPORT-only)

Render the three fields for the operator:

```
=== Session Handoff: {effort_label} ===

Context: {verified locator}

Phase / Status (from retained context): {phase} / {status}

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
reply is sufficient and that this briefing changed no context. Never instruct the operator to
enter a runtime-specific recovery command. This report-only turn takes no action; on the next live
reply, the coordinator binds the choice to this exact context presentation and routes
continuation internally to the recovery capability installed in the active runtime.

---

## REPORT-only Boundary

**HARD boundary:** `resume-session` never mutates files, Pages or settings and
never dispatches an agent. It reads retained handoff/status and emits the briefing.
A later affirmative reply is a new coordinator turn; it takes no action here.

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
