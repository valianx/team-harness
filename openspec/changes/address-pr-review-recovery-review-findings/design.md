## Context

See `proposal.md` for motivation and `specs/pr-review-independence/spec.md` for the tightened contract. The existing implementation distributes semantic agent sources into Claude, Codex, plugin, setup, and OpenCode projections, while the recovery decision is centralized in the canonical `review_context.py` and mirrored by generators. Any correction therefore has to land in canonical inputs first and pass freshness checks for every projection.

## Goals / Non-Goals

**Goals:**

- Make every project content read prove regular-file type, absence of symlinks, and resolved-path containment inside the frozen worktree.
- Keep deleted paths and absent optional workspaces out of required-read validation.
- Make positive snapshot and freshness evidence explicit at the recovery-classifier boundary.
- Preserve deterministic one-retry recovery and all immutable-snapshot and publication interlocks.

**Non-Goals:**

- Changing how snapshots are captured or refreshed.
- Expanding reviewer filesystem access or permitting moving-branch reads.
- Changing retry counts, review verdict semantics, or publish approval.
- Resolving GitHub review threads before code and validation evidence exist.

## Decisions

### Encode path safety in every semantic reviewer source

The general reviewer, QA lens, security lens, and coordinator reference contract will state the same rule: changed-list membership is only a candidate coordinate, and content access requires an existing non-symlink regular file whose resolved path remains under the frozen worktree. Deleted evidence is taken from the captured diff. This prevents a weaker generated or packaged entry point from bypassing the canonical rule.

Alternative considered: rely on changed-files membership alone. Rejected because a PR-controlled symlink can still redirect a content read outside the snapshot, and deleted entries are not readable leaves at the reviewed head.

### Treat `none` as absence, not a filesystem coordinate

The coordinator will pass `--required-directory` only for a non-`none` workspace coordinate. All actual supplied artifacts remain required. This keeps the classifier strict without turning an allowed absence into a fabricated unreadable directory.

Alternative considered: teach the classifier that a literal path named `none` is special. Rejected because optional-coordinate interpretation belongs at packet construction and a magic filesystem value would blur the required-coordinate boundary.

### Require explicit snapshot evidence at the CLI boundary

The four status arguments will be required CLI inputs. The underlying Python function already validates their domains and fails closed on negative states; removing positive defaults prevents an omitted check from being represented as a successful check.

Alternative considered: add an `unknown` default. Rejected because the existing command contract treats malformed or incomplete invocation as a helper error that fails closed, and argparse rejection is simpler and deterministic.

### Regenerate mirrors from canonical sources

Canonical semantic agent files and the canonical review helper will be edited first. Existing repository generation and sync commands will update packaged copies and verify freshness; manual divergence in generated files is not accepted.

## Risks / Trade-offs

- [Agent runtimes may expose only coarse file-discovery tools] → State the required proof semantically and forbid content reads until the runtime can establish all three properties; inability to prove a candidate means skip it, not broaden access.
- [Stricter CLI arguments break undocumented callers] → Search all invocations and tests, update them to pass explicit evidence, and add a negative CLI regression proving omission cannot authorize recovery.
- [Generated projections drift] → Run Codex generation checks, generator tests, focused review-context tests, and relevant repository lint/generation validation.
- [Thread resolution could hide residual defects] → Reply and resolve each thread only after its specific correction and validation evidence are committed and pushed.

## Migration Plan

Apply the canonical edits, regenerate mirrors, run focused and shared validation, commit to the existing PR branch, and push only after the local evidence passes. Rollback is the corrective commit only; the original immutable-snapshot recovery behavior remains independently revertible.
