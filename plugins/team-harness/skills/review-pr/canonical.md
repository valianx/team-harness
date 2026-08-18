
Analyze `$ARGUMENTS`. Accept a PR number (`45`, `#45`) or URL.

## Options

- `--reviewers <focus[,focus]>`: request explicit lenses. `general` and `architecture`
  use reviewer passes; `security` selects the security specialist.
- `--multi`: shorthand for `--reviewers general,architecture`.
- `[TIER: N]`: compatibility override. Tier 4 forces the security specialist; other values do not add reviewers.
- `--resume-from-draft`: publish a saved draft only after snapshot validation.
- `--auto-publish`: operator opt-in to skip the preview menu.
- `--converge`: compatibility alias for `--multi`. Run one set of independent passes; never loop until models agree.

Remove options before parsing the PR identifier.

## Non-negotiable invariants

1. Invoke `orchestrator` for every agent dispatch. Agents run no Bash.
2. Bind every artifact and GitHub review to the captured `head_oid` and `context_hash`.
3. Review the detached worktree, never the operator's checkout or a moving branch.
4. Fail closed when code or semantic conversation freshness cannot be verified.
5. Never publish without preview and explicit approval unless `--auto-publish` was supplied.
6. Publish one atomic GitHub review containing `body`, `event`, `commit_id`, and `comments`.
7. Keep each finding in one public channel:
   - an anchored finding lives in an inline thread;
   - a genuinely cross-file finding lives in the review body;
   - the body may count inline findings but must not repeat them.
8. Preserve every supported blocking finding. Brevity removes repetition and optional commentary, never blockers.
9. Store every local review artifact under the repository's `workspaces/pr-review-{number}/`.
   Before creating that directory, ensure the repository `.gitignore` contains an anchored
   `/workspaces` or `/workspaces/` entry; add `/workspaces/` when neither exists. Never use
   `.claude/` for review state.

## Operator-facing communication

Keep snapshot mechanics internal. Operator updates explain who is working, what each specialist
is checking, and what decision comes next; they do not narrate skill reads, preflight checks,
worktree setup, immutable-SHA binding, context hashes, artifact paths, or wait-tool lifecycle.

At startup, announce only that Team Harness will prepare a PR review. When `--auto-publish` is
absent, state that nothing will be published before approval. When `--auto-publish` was supplied,
state that the operator opted into automatic publication after validation and that no preview menu
will be shown. After selecting specialists, announce the exact agents and their useful scope:

- `reviewer`: functional correctness, regressions, and API/data contracts;
- `pr-review-qa`: acceptance evidence, when selected;
- `pr-review-security`: permissions, input validation, and trust/data boundaries, when selected;
- `reviewer-consolidator`: de-duplication and one final draft, only when more than one review
  result exists.

Use concrete changed surfaces when known, such as query semantics, DTO contracts, migrations, or
authorization boundaries. Do not call agents abstract "lenses" in operator-facing prose.

Do not emit messages whose only content is `waiting for agents`, `no agents completed yet`, or an
equivalent tool-status narration. During an extended wait, send a concise value-bearing update
that names the active specialists and the affected surfaces they are inspecting. Do not expose
head/base SHAs or the context hash unless identity drift blocks the review, the values are needed
to distinguish a superseded review, or the operator explicitly requests technical details.

If `ensure-workspaces-ignore` adds a tracked `.gitignore` entry, report that material change once
after it happens. Do not repeat it in progress updates or the review preview.

## Resume

Require `workspaces/pr-review-{number}/pr-review-context.json`, a non-empty body draft, and
`workspaces/pr-review-{number}/pr-review-inline.json` (an empty JSON array is valid). Capture a fresh context and run
`review_context.py compare`.

- `current`: continue at Preview. Carry a reported `mergeability_changed` as one informational
  drift line in the preview; it never blocks resume.
- `conversation-changed` or `code-changed`: discard the draft and restart at Gather.
- Capture failure or missing snapshot identity: stop; do not publish a legacy or stale draft.

## Gather

### 1. Resolve the helper and repository

Resolve `{owner}/{repo}` from the URL or `gh repo view`. Require authenticated `gh`, Python 3,
and the bundled helper. Resolve it in this order:

1. latest `~/.claude/plugins/cache/team-harness-marketplace/th/*/skills/review-pr/scripts/review_context.py`
2. `~/.claude/skills/review-pr/scripts/review_context.py`
3. the opencode skill install:
   `${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/skills/review-pr/scripts/review_context.py`
   (Windows: `%APPDATA%\opencode\skills\review-pr\scripts\review_context.py`; a project-scope
   install uses `<repo>/.opencode/skills/review-pr/scripts/review_context.py`)
4. `scripts/review_context.py` resolved against this skill's own directory (the directory
   containing this document) — the packaged copy on Codex and opencode installs
5. `./skills/review-pr/scripts/review_context.py`

If any prerequisite is unavailable, stop with:

```text
cannot capture a trustworthy PR snapshot — authenticate gh or paste the diff and conversation
```

Do not recreate the helper inline.

### 2. Capture immutable context

```bash
REVIEW_ROOT="$(git rev-parse --show-toplevel)"
python3 "$REVIEW_CONTEXT_HELPER" ensure-workspaces-ignore --repo-root "$REVIEW_ROOT"
WORKSPACES_ROOT="$REVIEW_ROOT/workspaces"
ARTIFACTS="$REVIEW_ROOT/workspaces/pr-review-{number}"
if ! git -C "$REVIEW_ROOT" check-ignore -q -- "workspaces/.team-harness-ignore-probe"; then
  echo "cannot create a safe local review workspace — workspaces/ is not ignored" >&2
  exit 1
fi
if [ -L "$WORKSPACES_ROOT" ] || { [ -e "$WORKSPACES_ROOT" ] && [ ! -d "$WORKSPACES_ROOT" ]; }; then
  echo "cannot create a safe local review workspace — workspaces is not a real directory" >&2
  exit 1
fi
python3 - "$REVIEW_ROOT" "$ARTIFACTS" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1]).resolve(strict=True)
candidate = Path(sys.argv[2]).resolve(strict=False)
candidate.relative_to(root)
PY
if [ ! -e "$WORKSPACES_ROOT" ]; then
  mkdir -m 700 "$WORKSPACES_ROOT"
fi
if [ "${RESUME_FROM_DRAFT:-false}" = "true" ]; then
  if [ -L "$ARTIFACTS" ] || [ ! -d "$ARTIFACTS" ]; then
    echo "cannot resume review — review workspace is not a real directory" >&2
    exit 1
  fi
else
  if [ -e "$ARTIFACTS" ] || [ -L "$ARTIFACTS" ]; then
    echo "cannot start a fresh review — review workspace already exists; resume or cancel it first" >&2
    exit 1
  fi
  mkdir -m 700 "$ARTIFACTS"
fi
python3 - "$REVIEW_ROOT" "$ARTIFACTS" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1]).resolve(strict=True)
candidate = Path(sys.argv[2]).resolve(strict=True)
candidate.relative_to(root)
PY
if ! git -C "$REVIEW_ROOT" check-ignore -q -- "$ARTIFACTS"; then
  echo "cannot use the local review workspace — created directory is not ignored" >&2
  exit 1
fi
CONTEXT="$ARTIFACTS/pr-review-context.json"
CONVERSATION="$ARTIFACTS/pr-review-conversation.md"
SNAPSHOT_GIT="$ARTIFACTS/pr-review-snapshot.git"
GATHER_DEADLINE="$(python3 "$REVIEW_CONTEXT_HELPER" deadline --seconds 60)"

if [ "${RESUME_FROM_DRAFT:-false}" = "true" ]; then
  for leaf in "$CONTEXT" "$ARTIFACTS/pr-review-final.md" "$ARTIFACTS/pr-review-inline.json"; do
    if [ -L "$leaf" ] || [ ! -f "$leaf" ]; then
      echo "cannot resume review — required artifact is not a regular non-symlink file" >&2
      exit 1
    fi
  done
fi

CONTEXT_TMP="$(mktemp "$ARTIFACTS/tmp-pr-review-context.XXXXXX")"
CONVERSATION_TMP="$(mktemp "$ARTIFACTS/tmp-pr-review-conversation.XXXXXX")"
python3 "$REVIEW_CONTEXT_HELPER" capture \
  --repo "{owner}/{repo}" --pr {number} --git-dir "$REVIEW_ROOT" \
  --snapshot-dir "$SNAPSHOT_GIT" --deadline-epoch "$GATHER_DEADLINE" \
  --output "$CONTEXT_TMP"
python3 "$REVIEW_CONTEXT_HELPER" render \
  --context "$CONTEXT_TMP" --output "$CONVERSATION_TMP"
python3 "$REVIEW_CONTEXT_HELPER" promote-artifact --artifact-root "$ARTIFACTS" \
  --temporary-name "${CONTEXT_TMP##*/}" --final-name "${CONTEXT##*/}"
python3 "$REVIEW_CONTEXT_HELPER" promote-artifact --artifact-root "$ARTIFACTS" \
  --temporary-name "${CONVERSATION_TMP##*/}" --final-name "${CONVERSATION##*/}"
```

Every later artifact write follows the same leaf-safe rule: create a unique
regular temporary file inside `$ARTIFACTS`, write only that temporary file,
verify with `lstat` that it is regular and non-symlink and canonically contained
under `$ARTIFACTS`, reject an existing final leaf unless it is also regular and
non-symlink, then atomically rename the temporary file over the final leaf.
Never redirect or open a fixed final artifact path directly. The exclusive
fresh-directory creation and these atomic promotions are mandatory, not
best-effort snapshot checks.

Read metadata and immutable refs from `$CONTEXT`. Store `head_oid`, `base_oid`,
`merge_base_oid`, `context_hash`, `fetched_at`, `is_cross_repository`, and the classified and raw
mergeability values.

The helper resolves the configured source remote from `$REVIEW_ROOT`, initializes without user Git
templates or validates a private bare repository at `$SNAPSHOT_GIT`, and fetches the exact base SHA
and PR head ref only there. It borrows the operator checkout's existing object database during the
fetch, then repacks every reachable snapshot object locally so the bare repository is
self-contained before use. It must never fetch, update refs, create worktree administration, or
otherwise write inside the operator checkout's `.git`.

`GATHER_DEADLINE` is shared by context capture, diff and file-list generation, checks collection,
and detached worktree creation. Every subprocess is non-interactive and consumes only the time
remaining in that one 60-second budget. A timeout or snapshot validation failure fails closed
without sandbox escalation. Every later freshness recapture starts a new deadline, reuses
`$SNAPSHOT_GIT`, and passes the same `--snapshot-dir`.

### 3. Materialize review artifacts

Write data once and pass paths to agents. Do not duplicate the diff, policy, or conversation
inside Task prompts.

```bash
DIFF="$ARTIFACTS/pr-review-diff.patch"
FILES="$ARTIFACTS/pr-review-files.txt"
CHECKS="$ARTIFACTS/pr-review-checks.txt"
DIFF_TMP="$(mktemp "$ARTIFACTS/tmp-pr-review-diff.XXXXXX")"
FILES_TMP="$(mktemp "$ARTIFACTS/tmp-pr-review-files.XXXXXX")"
CHECKS_TMP="$(mktemp "$ARTIFACTS/tmp-pr-review-checks.XXXXXX")"
WORKTREE="$ARTIFACTS/pr-review-worktree"

python3 "$REVIEW_CONTEXT_HELPER" materialize \
  --repo "{owner}/{repo}" --pr {number} --context "$CONTEXT" \
  --artifact-root "$ARTIFACTS" --snapshot-dir "$SNAPSHOT_GIT" \
  --diff-name "${DIFF_TMP##*/}" --files-name "${FILES_TMP##*/}" \
  --checks-name "${CHECKS_TMP##*/}" --worktree "$WORKTREE" \
  --deadline-epoch "$GATHER_DEADLINE"
# Register the EXIT trap here, immediately after materialize returns and before promotion.
python3 "$REVIEW_CONTEXT_HELPER" promote-artifact --artifact-root "$ARTIFACTS" \
  --temporary-name "${DIFF_TMP##*/}" --final-name "${DIFF##*/}"
python3 "$REVIEW_CONTEXT_HELPER" promote-artifact --artifact-root "$ARTIFACTS" \
  --temporary-name "${FILES_TMP##*/}" --final-name "${FILES##*/}"
python3 "$REVIEW_CONTEXT_HELPER" promote-artifact --artifact-root "$ARTIFACTS" \
  --temporary-name "${CHECKS_TMP##*/}" --final-name "${CHECKS##*/}"
```

Do not execute the PR's code or install dependencies. Existing CI results are evidence; local
test execution is an explicit operator action outside this skill.

If the PR body links an issue with `Closes`, `Fixes`, or `Resolves`, fetch its number, title,
body, and labels once into `$ARTIFACTS/pr-review-issue.json`. Treat failure as
`linked issue: unavailable`, not as a reason to weaken snapshot checks.

### 4. Create the frozen worktree and cleanup trap

`materialize` creates the detached worktree within the shared deadline and attempts to remove a
partially created worktree using only the remaining budget if it fails. If no time remains or
cleanup cannot finish in that budget, it fails closed and reports the exact residual paths for
operator cleanup. Register an EXIT trap immediately after `materialize` succeeds. It
removes the worktree, all
artifacts inside the exact `$ARTIFACTS` directory (including the private bare repository and its
temporary refs), and that now-empty directory. Remove the worktree through `$SNAPSHOT_GIT` before
removing the snapshot repository. Never remove any sibling workspace or force-remove an unexpected
dirty worktree; surface it.

Capture `git status --untracked-files=all` and `git diff HEAD` for the frozen worktree. Separately
capture the regular review-artifact leaves under `$ARTIFACTS`, excluding the exact
`$SNAPSHOT_GIT` and `$WORKTREE` directories and their contents — Git legitimately updates
administrative data in the snapshot during freshness checks and cleanup, and the worktree's
integrity is verified by its own status/diff snapshot above. Repeat both snapshots after all agents finish.
The compared surfaces must be byte-identical; surface any other mutation as a defect before
trusting a returned draft. Only after this check may the coordinator persist inline returns to the
fixed `$ARTIFACTS/pr-review-*` paths.

Detect an existing pipeline workspace from `workspaces/*/01-plan.md` or
`workspaces/*/02-implementation.md` inside `$WORKTREE`. If present:

- run the resolved `sketch-guard.sh` probe best-effort;
- pass the workspace path to the reviewer and QA;
- let each receiving agent read only the sketches relevant to its own lens.

Do not preload or paste sketches into dispatches.

### 5. Load optional policy and prior-review identity

Set `policy_path` to `$WORKTREE/.team-harness/review-policy.md` when present; otherwise use
`none`. Do not paste its contents into Task prompts.

Resolve the authenticated login and run:

```bash
python3 "$REVIEW_CONTEXT_HELPER" same-author \
  --context "$CONTEXT" --login "$(gh api user --jq '.login')"
```

Keep the returned review, if any, for duplicate detection.

## Select lenses

The default is one `general` reviewer. PR size alone never adds reviewers.

Run the local selector before adding specialist agents:

```bash
python3 "$REVIEW_CONTEXT_HELPER" select-security \
  --changed-files "$FILES" --diff "$DIFF" \
  {--explicit-security when requested} {--tier 4 when supplied}
```

The selector returns `known-sensitive`, `known-non-executable`, `unmatched-executable`, or
`indeterminate`, alongside `security_required` and the trigger list. `known-non-executable` now
also covers configuration-only diffs (`.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`,
`.properties`); `.env` variants and sensitive filenames such as `package.json`/`go.mod` are still
caught earlier by the filename check and stay sensitive. Security is required for
`known-sensitive` or `unmatched-executable`, and for an explicit request or Tier 4 regardless of
suffix classification; `known-non-executable` and `indeterminate` omit it otherwise, including
when the helper is missing or the input is unreadable. State the resolved `reason` whenever
security is omitted, so a not-required outcome stays visible instead of silent.

Add specialist agents only from concrete signals:

- **QA:** a pipeline workspace with acceptance criteria exists and the diff changes executable
  behavior. Skip for docs, changelog, package metadata, formatting, and configuration-only
  changes unless an AC explicitly describes that surface.
- **Security:** the selector reports `security_required: true`.
- **Focused reviewer passes:** only `general`/`architecture`, and only when explicitly requested
  through `--reviewers`/`--multi`.
  A large PR remains one general pass; report coverage limits instead of multiplying opinions.

The general reviewer owns goal fit, correctness, public contracts, error behavior, and
change-caused regressions. QA owns acceptance evidence. Security owns exploitability and trust
boundaries. Do not ask two lenses to perform the same generic review.

Announce the selected specialists using the operator-facing communication contract above. Include
`reviewer-consolidator` in that announcement only when the selected set will require it.

## Pre-dispatch freshness

Capture a new context immediately before dispatch and compare it with `$CONTEXT`.

- `current`: dispatch. Carry a reported `mergeability_changed` as one informational drift line;
  it never blocks dispatch.
- `conversation-changed` or `code-changed`: rebuild artifacts and restart Gather once.
- A second movement or capture failure: stop without reviewing.

## Dispatch

The four PR agents are `reviewer`, `pr-review-qa`, `pr-review-security`, and
`reviewer-consolidator`. Their source manifests and OpenCode projections are deny-by-default and
read-only. Codex dispatch is unavailable unless a Team Harness Codex projection exists and its
capability validator confirms the same exact allowlist; never inherit a general agent's authority.
Host overrides after Team Harness emits an artifact are outside this guarantee.

Before any dispatch, require the selected runtime to expose all four exact agent identities. In
Codex, accept one complete project or global set only; every file must be a regular non-symlink
Team Harness-generated TOML with the matching `name`, instruction-source marker, semantic-source
marker, projection/profile marker, and `sandbox_mode = "read-only"`. The general `reviewer` may
have only filesystem-read plus external-read capability in the canonical registry; the QA,
security, and consolidator roles may have only filesystem-read. A missing, mixed, unmanaged, or
stale set blocks review before snapshot dispatch. Direct the operator to
`$team-harness:setup agents` or `$team-harness:update`, then require a new Codex thread so newly installed agent
declarations are discovered.

Pass coordinates and artifact paths, not artifact bodies:

```text
Direct Mode Task:
- Mode: review
- Focus: general
- PR: #{number}
- Repository: {owner}/{repo}
- Base: {base_ref}
- Head: {head_ref}
- Reviewed Head SHA: {head_oid}
- Base SHA: {base_oid}
- Merge Base SHA: {merge_base_oid}
- Context Hash: {context_hash}
- Mergeability: {clean|conflicting|indeterminate}
- Raw Mergeable: {raw mergeable value}
- Raw Merge State: {raw mergeStateStatus value}
- Worktree: {WORKTREE}
- Review Artifacts Root: {ARTIFACTS absolute path}
- Context Path: {CONTEXT}
- Conversation Path: {CONVERSATION}
- Diff Path: {DIFF}
- Changed Files Path: {FILES}
- Checks Path: {CHECKS}
- Policy Path: {policy_path or "none"}
- Workspace Path: {workspace_path or "none"}
- Linked Issue Path: {$ARTIFACTS/pr-review-issue.json absolute path or "none"}
- Draft Output: $ARTIFACTS/pr-review-draft{suffix}.md
- Inline Output: $ARTIFACTS/pr-review-inline{suffix}.json
```

For explicit general/architecture passes, change `Focus` and use a focus suffix. Dispatch
independent passes in parallel. Never dispatch both a security-focused reviewer and the security
specialist for the same review.

When selected, dispatch QA and `pr-review-security` in parallel with only their required
coordinates:

```text
Mode: pr-review-qa | pr-review-security
PR: #{number}
Reviewed Head SHA: {head_oid}
Context Hash: {context_hash}
Worktree: {WORKTREE}
Workspace Path: {workspace_path or "none"}
Context Path: {CONTEXT}
Diff Path: {DIFF}
Changed Files Path: {FILES}
```

Every lens returns its draft inline with the exact reviewed SHA and context hash. Reject a missing
or mismatched value. After the strict post-dispatch snapshots pass, the coordinator alone persists
returns using this fixed mapping: reviewer body → `$ARTIFACTS/pr-review-draft.md`, reviewer findings →
`$ARTIFACTS/pr-review-draft-inline.json`, QA → `$ARTIFACTS/pr-review-qa.md`, security →
`$ARTIFACTS/pr-review-security.md`, consolidator body → `$ARTIFACTS/pr-review-final.md`, and consolidator
findings → `$ARTIFACTS/pr-review-inline.json`. Ignore any output path proposed by an agent.

If only the general reviewer ran, its body and inline JSON are canonical. If any additional
draft exists, dispatch `review-consolidate` once with the source file paths, `head_oid`,
`context_hash`, and the read-only `Worktree` coordinate so adjudication cites code, not prose.
The consolidator produces:

- `$ARTIFACTS/pr-review-final.md`
- `$ARTIFACTS/pr-review-inline.json`

There is no automatic convergence loop.

**Reconcile the consolidation.** The consolidator's status block enumerates, per source lens,
findings received and their disposition (`preserved`, `demoted`, `dropped`) with a one-line
reason each. Before preview, verify every blocking finding present in a source draft appears
either in the consolidated output or in that ledger; on a mismatch, retry the consolidator once
with the discrepancy named, then stop and surface it. A missing or count-inconsistent ledger is
a failed consolidation, never a silent pass-through.

**Lens coverage line.** After the canonical body is chosen (either path), insert one line under
`Checks:` naming each selected lens and its outcome — `ran`, `limited ({reason})`, or
`absent after retry` — for example `Lenses: reviewer ran, qa limited (no operator oracle),
security ran`. This line is coordinator-owned mechanical metadata; agents never write it. An
absent selected lens must appear here, so a published APPROVE can never hide a lens that did not
run.

While agents run, keep raw dispatch coordinates and identity validation silent. If a progress
update is warranted, name the active agents and summarize their distinct review responsibilities
against the concrete changed surfaces; never relay raw agent status blocks or waiting-tool output.

## Output contract

The canonical GitHub review has two surfaces.

### Body

Use a compact index:

```markdown
## Review

Verdict: **APPROVE | REQUEST CHANGES | COMMENT**
Findings: **{N} blocking**, **{M} suggestions**
Checks: {concise CI summary or "not available"}
Lenses: {coordinator-inserted coverage line}

{Only cross-file findings that cannot be anchored to one changed line. Omit when empty.}
```

Do not include reviewability scores, estimated time, file counts, per-agent sections, repeated
inline findings, praise, or out-of-scope observations by default.

Target at most 80 lines and 900 words. If supported cross-file blockers require more, preserve
them and remove optional prose; never truncate a blocker.

### Inline threads

Use one comment per actionable, line-anchored finding:

```markdown
**Blocking: {claim}**

{Evidence and consequence in at most three short sentences.}

**Fix:** {concrete correction in at most two short sentences.}
```

Use `Suggestion` instead of `Blocking` for non-blocking improvements. Publish every supported
blocker. Keep at most five suggestions globally. Omit style-only nitpicks.

Inline JSON must contain only GitHub fields:

```json
[{"path":"src/file.ts","line":42,"side":"RIGHT","body":"..."}]
```

Every inline finding requires `side: LEFT | RIGHT`. Validate the full `(path, line, side)` anchor
against the frozen diff before preview and preserve `side` unchanged in the published comments.

## Prior-review check

- No prior review from this author: continue.
- Prior review with `commit_id == head_oid`: stop; do not duplicate it.
- Prior review on another SHA: preview the new review as superseding that historical review.

Never dismiss prior reviews automatically.

## Preview

Require a non-empty body and valid inline JSON. Retry the producing agent once for a missing or
invalid artifact; then stop.

Unless `--auto-publish` was supplied, show the evidence before the recommendation:

1. `PR #{number} review ready — nothing has been published.`;
2. the exact body;
3. every inline comment with path, line, and side;
4. a superseded-review note when applicable, without exposing snapshot identity unless needed to
   disambiguate it;
5. an informational mergeability-drift line when the latest freshness comparison reported
   `mergeability_changed`, never phrased as a blocker;
6. a closing `Recommendation:` with the event in plain language and one concise rationale grounded
   in the supported findings and available checks;
7. five numeric choices with the recommended publish event first and marked `**(recommended)**`.

Build the rationale without adding new findings: for `REQUEST_CHANGES`, state the blocking count
and concrete consequence category; for `APPROVE`, state that no supported blockers remain and
qualify the available check evidence; for `COMMENT`, state why the draft is informational rather
than an approval or change request.

**Approval anchor.** When the operator approves, record the SHA-256 of the exact canonical body
artifact and inline JSON shown in the preview. The approval applies to those bytes and the
displayed `context_hash` only.

Use exactly one of these menus, matching the recommendation:

```text
REQUEST_CHANGES:
1 — Request changes **(recommended)**
2 — Comment only
3 — Approve
4 — Defer
5 — Cancel

APPROVE:
1 — Approve **(recommended)**
2 — Comment only
3 — Request changes
4 — Defer
5 — Cancel

COMMENT:
1 — Comment only **(recommended)**
2 — Request changes
3 — Approve
4 — Defer
5 — Cancel
```

Accept the number or an unambiguous action phrase. Keep head/base SHAs, capture time, raw
mergeability, context hash, and snapshot/worktree details hidden by default; provide them only on
explicit request or when an integrity/freshness problem requires operator action.

`defer` copies the canonical body to `$ARTIFACTS/pr-review-final.md`, preserves that file, inline
JSON, and context for `--resume-from-draft`, removes the worktree/nonessential artifacts, and
disables the EXIT trap before returning. `cancel` removes all artifacts. Operator edits require
another complete preview.

**`--auto-publish` path.** No menu is shown and no approval exists: the published event is
exactly the recommendation's event, the anchor is taken from the canonical draft at validation
time, and the pre-publish freshness comparison runs against the pre-dispatch capture. Any drift,
capture failure, or anchor mismatch stops without publishing — the auto path never retries past
a failed check and never publishes an event other than the recommendation.

## Pre-publish freshness

After approval and immediately before the GitHub write, capture and compare again against the
approved capture.

- `current`: proceed directly to the write. When the comparison reports `mergeability_changed`,
  add one informational drift line to the publish confirmation; it never blocks the write.
- First `code-changed` result: invalidate approval, restart Gather once, and return to Preview
  for renewed approval.
- `code-changed` again on the capture taken after that restart: stop without restarting further —
  present the drift to the operator and keep the drafted review for a manual retry.
- `conversation-changed`: invalidate approval and restart Gather.
- Capture or comparison failure: invalidate approval and restart Gather with
  `freshness could not be verified — review not published`.

Approval applies only to the displayed `context_hash` and the recorded draft hashes: recompute
the SHA-256 of the canonical body and inline JSON immediately before the write and require
equality with the approval anchor. A mismatch means the draft changed after approval — fail
closed and re-preview; never publish unanchored bytes.
Never describe `conflicting` or `indeterminate` mergeability as merge-ready.
`clean` describes only the displayed captured head/base/time; it never asserts current external
readiness. State that the external system can change after Team Harness's final local check.

## Publish

Map the operator's numeric or textual choice to `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`.
When the chosen event differs from the recommendation, rewrite the body's `Verdict:` line to the
chosen event through the leaf-safe artifact rule, refresh the approval anchor to the rewritten
bytes, and show the operator the updated verdict line before the write — the published body and
event must never disagree. Submit exactly once:

```bash
jq -n \
  --arg body "$(python3 "$REVIEW_CONTEXT_HELPER" safe-read --artifact-root "$ARTIFACTS" --name "${CANONICAL_DRAFT##*/}")" \
  --arg event "$EVENT" \
  --arg commit_id "$head_oid" \
  --argjson comments "$(python3 "$REVIEW_CONTEXT_HELPER" safe-read --artifact-root "$ARTIFACTS" --name pr-review-inline.json)" \
  '{body: $body, event: $event, commit_id: $commit_id, comments: $comments}' \
| gh api -X POST "repos/{owner}/{repo}/pulls/{number}/reviews" --input -
```

Never split the body and inline comments across API calls. Check the exit status, report the
exact error on failure, and run cleanup on every terminal path.

Final response:

```text
Review on PR #{number} published as {APPROVE | REQUEST CHANGES | COMMENT}.
```

## No input

Ask for a PR number or URL and stop.
