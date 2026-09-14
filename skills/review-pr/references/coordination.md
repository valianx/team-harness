## Select lenses

The default is one `general` reviewer. PR size alone never adds reviewers.

Run the local selector before adding specialist agents:

```bash
python3 "$REVIEW_CONTEXT_HELPER" select-security \
  --changed-files "$FILES" --diff "$DIFF" \
  {--explicit-security when requested} {--tier 4 when supplied}
```

The selector returns `security_required` with its `reason` and triggers: omitted only for
`known-non-executable` or `indeterminate`; required for `known-sensitive`, `unmatched-executable`,
an explicit request, or Tier 4. Indeterminate alone is not a security trigger or evidence of
safety. A missing selector or unreadable required artifact prevents a trustworthy review and
fails closed. NUL-bearing text or a changed-file list inconsistent with an empty diff is an
invalid capture, not a classification waiver. State the resolved `reason` in the preview whenever security is omitted.

Keep coverage obligations fixed: **QA** when a pipeline workspace with acceptance criteria exists
and the diff changes executable behavior; **security** when the selector requires it; and every
explicit `--reviewers`/`--multi` focus. Main may partition or add focused reviewer passes when
independent risks or dependency boundaries justify them. File count alone does not.
Record a short coverage map: obligation, assigned reviewer, relevant paths/dependencies and why
parallel or sequential. Keep one general reviewer responsible for cross-component interactions;
do not leave contracts between partitions unowned. Respect native concurrency and configured
models/effort. Omit model and effort overrides at dispatch unless the operator explicitly selected
them; adaptation must not raise or lower those settings to fit an assignment or the available slots.

Initial assessments are independent: provide scope and enough shared dependency context, without
another reviewer's conclusions. Start with coordinates, changed surfaces and known constraints,
then load supporting files when they answer a concrete question. Avoid copying the whole
workflow, conversation, roster or unrelated reports into every packet. QA owns acceptance
evidence; security owns trust boundaries; the independent verifier checks selected final claims.
Main consolidates all returns, including a single draft. The installed `reviewer-consolidator`
is a compatibility asset, not a required dispatch or prerequisite.

Check only the selected role definitions, for example:

```bash
python3 "$REVIEW_CONTEXT_HELPER" preflight --repo-root "$REVIEW_ROOT" --runtime {claude|codex|opencode} \
  --agent reviewer --agent pr-review-security --agent pr-review-verifier
```

Repeat `--agent` for the actual unique role names; omit the verifier when policy is `off`.
Without explicit selections the compatibility default is reviewer plus verifier. Codex checks
packaging markers in each selected project/global definition, respecting project overrides;
this is not TOML validation or a trust attestation. Every runtime reports `native-check-required`:
verify selected native roles, read transport and effective permissions before dispatch. A successful
preflight does not authorize dispatch with unverified permissions. Announce the
selected specialists and their concrete responsibilities.

## Dispatch

Dispatch only selected native PR roles. Check their effective read boundary, including shell,
network/MCP writes and nested delegation; filesystem read-only alone does not cover those paths.
Keep scoped writing permissions for implementers and other authorized writing roles unchanged.

Pass coordinates and artifact paths, not artifact bodies. The `reviewer` packet is a
`Direct Mode Task` with `Mode: review`, `Focus`, `PR`, `Repository`, `Base`, `Head`,
`Reviewed Head SHA`, `Base SHA`, `Merge Base SHA`, `Technical Hash`, `Conversation Hash`,
`Context Hash`, `Mergeability` with both raw GitHub values, `Worktree`, `Review Artifacts Root`,
`Context Path`, `Conversation Path`, `Diff Path`, `Changed Files Path`, `Checks Path`,
`Policy Path`, `Workspace Path`, and `Linked Issue Path` (each `none` when absent),
`Workspace Manifest Path` and `Workspace Files` from the optional workspace capture, plus
`Draft Output: $ARTIFACTS/pr-review-draft{suffix}.md` and
`Inline Output: $ARTIFACTS/pr-review-inline{suffix}.json`. Main assigns a unique non-empty
suffix to every reviewer pass, including the default (`-general`), so source reports cannot
collide with canonical or verification artifacts.

For focused or partitioned passes, change `Focus`, add the bounded scope and use a unique suffix. Dispatch
independent passes in parallel. Never dispatch both a security-focused reviewer and the security
specialist for the same review.

When selected, dispatch QA and `pr-review-security` in parallel with only their required
coordinates: `Mode`, `PR`, `Reviewed Head SHA`, `Technical Hash`, `Context Hash`, `Worktree`,
`Workspace Path`, `Context Path`, `Diff Path`, and `Changed Files Path`.
QA also receives `Workspace Manifest Path` and its relevant `Workspace Files`; security receives
no workspace context unless its assignment needs it. Select QA from the captured acceptance
context even when the source workspace is outside the repository. Absent workspace context uses
`none` for its manifest and an empty file list.

### Read boundary and absent returns

Every non-`none` coordinate in a dispatch is required; before dispatch, verify each artifact
coordinate is a regular non-symlink leaf inside `$ARTIFACTS` or `$WORKTREE`, and `Worktree` and
`Workspace Path` are contained non-symlink directories. Reviewers read only supplied coordinates and
the explicitly listed workspace leaves; a supplied workspace directory never widens that allowlist.
They may also read project leaves proven to exist as regular files inside the frozen worktree;
a deleted changed-file
path is evidence from `Diff Path` only, and source markers are never read coordinates. Every lens
returns its draft inline with the exact reviewed SHA, technical hash, and context hash. Validate
each return once:

- A missing return field or mistaken path may receive one focused follow-up to the same agent
  with the discrepancy and verified coordinate. Preserve its successful same-snapshot work;
  never fabricate an identity echo. If it still cannot return a valid assessment, record
  `absent ({reason})` and force `COMMENT`. A required artifact that actually cannot be read is a
  trust failure, not an invitation to guess its contents.
- A mismatched reviewed SHA or technical hash, a non-identical post-dispatch snapshot, or a failed
  freshness comparison is an integrity failure: fail closed without preview or publication.
- A stale context hash with the same technical hash is conversation drift and follows the
  reconciliation path below.
- An absent general reviewer or a consolidation that leaves no trustworthy canonical draft fails
  closed with the violated rule reported; never fabricate findings or drop an unaccounted blocker.

After validating the returned SHA and technical hash, the coordinator alone persists returns using
the suffix it assigned: each reviewer body → `$ARTIFACTS/pr-review-draft{suffix}.md`, that pass's
findings → `$ARTIFACTS/pr-review-inline{suffix}.json`, QA → `$ARTIFACTS/pr-review-qa.md`, security →
`$ARTIFACTS/pr-review-security.md`, Main's canonical body → `$ARTIFACTS/pr-review-final.md`,
Main's final findings → `$ARTIFACTS/pr-review-inline.json`, verifier →
`$ARTIFACTS/pr-review-verifier.json`. Preserve both source coordinates for every pass in the ledger,
including zero-finding reports. Ignore any output path proposed by an agent.

### Post-dispatch conversation reconciliation

After every selected technical specialist joins and its return is identity-validated, run
`refresh-context` once more. `continue` uses the results; `restart-technical-review` discards them
and restarts Gather once; `reconcile-conversation` preserves every result whose `technical_hash`
matches and reruns same-author/prior-review detection. Main reconciles the conversation once,
binding the updated draft to the unchanged `technical_hash` and fresh `context_hash`. If the
discussion exposes a concrete technical question, follow up once with only its responsible
specialist and cited locus against the same snapshot, then reconcile the result. Do not restart
successful independent assessments for commentary or formatting changes.

### Canonical draft

Main reads every validated return, consolidates duplicate claims and resolves disagreements
against the frozen code, acceptance intent and current discussion. A specialist's severity or
verdict is advice, never an order. Persist Main's canonical body as `pr-review-final.md` and the
pre-verification inline set as `pr-review-draft-inline.json`, preserving each source report.

Use the existing finding ledger to account for every source finding, including suggestions and
body-only claims: source and original claim/anchor, final claim/anchor when preserved or merged,
disposition (`preserved`, `deduplicated`, `demoted`, `dropped`, or `unresolved`) and evidence/reason.
Persist this ledger as `pr-review-ledger.json`, retaining `head_oid`, `technical_hash`,
`context_hash` and the source report coordinates alongside the existing entries. Keep every
source report and the original verification input; these are evidence for resume, not temporary
consolidation scratch files.
A duplicate points to its surviving claim. Do not replace source assessments with Main's opinion.
Accounting does not require publication: retain non-actionable observations and style-only notes
in their source report and ledger with a reason for dropping them. A verifier confirming a fact
does not establish that the fact is a defect or an actionable improvement.
Before preview, reconcile source counts against the ledger and final channels. An unresolved
speculation is not a proven blocker; missing required coverage cannot become a clean approval.
Main may disagree with any specialist using recorded evidence. Preserve supported blockers and
their independent verification; never silently drop a claim to meet a length budget. Correct an
accounting mismatch locally before continuing, without a new agent or convergence loop.
