## Context

See [proposal.md](proposal.md) for motivation. The review flow already captures immutable context, diff, changed-files, conversation, policy, and frozen-worktree coordinates. The defect is in recovery: the Codex adapter currently collapses an agent's invalid inferred read into the same fatal category as an actual unreadable supplied artifact.

The design must work across the canonical skill, generated runtime projections, bundled agents, and installed setup assets without weakening snapshot or publish safety.

## Goals / Non-Goals

**Goals:**

- Make the coordinator automatically repair deterministic Team Harness reviewer-contract defects.
- Keep recovery on the byte-identical captured snapshot and coordinates.
- Give executable classification precedence over model interpretation.
- Allow other lenses to finish when one specialist repeats an internal contract error, while preventing approval from an incomplete review.

**Non-Goals:**

- Recover from corrupt, stale, mismatched, or genuinely unreadable supplied review state.
- Rebuild snapshots, substitute identities, infer findings, or bypass publish approval.
- Treat arbitrary reviewer failures as safe contract defects without sufficient evidence.

## Decisions

### 1. Enforce a positive read allowlist in every reviewer contract

Reviewer prompts begin with coordinator-supplied artifacts and the changed-files list. An additional project leaf can be opened only after an exact existence check proves it is a regular file under the frozen worktree. Instruction and semantic source markers remain metadata, not project paths.

This prevents the original mistake before recovery is needed. A denylist was rejected because conventional or model-inferred filenames are unbounded.

### 2. Put the recovery decision in the coordinator's executable helper

The review-context helper classifies a failed invocation from explicit coordinates and statuses. It validates required artifacts and directories under permitted roots and emits one closed decision vocabulary:

- `retry-contract` for the first proven agent-contract defect;
- `continue-comment` for a repeated specialist contract defect;
- `fail-closed` for integrity, required-read, canonical-draft, or unclassified failures.

A prompt-only rule was rejected because the adapter must not depend on another model judgment to decide whether a model contract violation is recoverable.

### 3. Retry once without operator involvement

On `retry-contract`, the coordinator reconstructs the dispatch from already captured coordinates, names the exact violation, and uses a fresh instance of the same agent identity. It does not recapture or clean the snapshot. Operator approval is inappropriate because this is internal execution repair, not a product or publication decision.

Unbounded retries were rejected because they can loop on a persistent prompt/runtime incompatibility.

### 4. Degrade only repeated specialist failures

A repeated specialist defect becomes an explicit absent-lens result and forces the review event to `COMMENT`. General reviewer or consolidator failure remains closed when no canonical draft can be trusted.

Silently dropping a specialist was rejected because it could permit an incomplete review to approve. Failing the entire review for every repeated specialist defect was rejected because independent successful lenses remain useful and the publication gate can safely expose the limitation.

### 5. Preserve all immutable-snapshot and publication checks

Recovery runs only after identity, byte snapshot, and freshness checks pass. Required supplied artifacts, the frozen worktree, and verified-existing project leaves remain fail-closed boundaries. Preview, live publish approval, approved-draft hash, and publish-time freshness are unchanged.

## Risks / Trade-offs

- **A failure lacks its exact path or an explicit contract signal** → Classify it as unverified and fail closed.
- **The coordinator omits a required artifact from classification** → Require every non-`none` dispatch artifact and fail closed on malformed invocation.
- **A specialist is unavailable after correction** → Mark the lens absent and force `COMMENT`; never present the review as complete.
- **Generated copies drift from canonical sources** → Extend generation checks to cover the helper and agent projections and run repository validation suites.

## Migration Plan

1. Update the capability delta and canonical workflow/role sources.
2. Add the deterministic classifier and focused behavior tests.
3. Regenerate Codex agents, packaged plugin assets, and mirrored review-pr helper files.
4. Run focused tests, generation freshness checks, structural lint validation, and whitespace validation.
5. Roll back by reverting the coordinated source and generated changes together; no persisted data migration is required.
