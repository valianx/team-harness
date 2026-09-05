## Context

See proposal.md for scope. `review_context.py` already captures immutable review identities, materializes owned review artifacts and applies verifier dispositions. The existing verifier and its Codex adapter deliberately cannot run repository code. The shared runtime already provides bounded argv execution and quality evidence primitives.

## Goals / Non-Goals

Add one optional reproduction path to the existing review. Keep the source diff and operator checkout immutable, retain the ordinary review result when reproduction is unavailable, and distinguish process failures from behavioral evidence. This is not a new review orchestrator, sandbox product, test framework or agent roster.

## Decisions

### Main owns the probe lifecycle

`--regressions` and equivalent live intent enable the additional investigation. Reviewers return concrete hypotheses through existing findings; Main selects the probe, intended preserved behavior and command. Main may author a minimal external test fixture inline and run it through permitted native execution. No extra writing specialist is required. Do not lift the reviewers' read-only restriction: analysis authority does not grant execution authority.

### Reuse execution and snapshot primitives

Add a small shared helper under `skills/review-pr/scripts/` for preparation, evidence capture/validation and comparison, reusing existing bounded-command and Git/evidence utilities where compatible. Prepare two disposable execution copies from the captured local Git objects; do not fetch a moving branch or run inside the frozen review worktree. Keep probe files external to the compared source and byte-identical across both runs. Repository-owned setup remains explicit and version-bound; missing prerequisites produce an inconclusive result rather than an implicit installation.

The helper must not turn invocation into broader native authority. The coordinator performs execution only within the runtime-permitted sandbox/approval boundary. Process cwd isolation is not filesystem or network confinement; when safe execution is unavailable, preserve the read-only review and report that limitation. Prefer passing evidence between existing primitives over implementing a second general-purpose quality runner.

### Machine observation and semantic confirmation are separate

The helper records exact commits, probe/command identities, process completion, limits and bounded output. Its outcome is a comparison observation, not a merge verdict. Recognizable assertion evidence is required before treating base-pass/head-fail as a regression candidate; unknown failure output remains inconclusive. The verifier checks intended behavior, reachable impact and causality against the code. Both-fail does not exclude a separate newly introduced defect, and a passing head probe covers only its assertion.

### Evidence joins the existing review

Persist the comparison under the owned review run, validate it before use, and provide an optional coordinate to the verifier. Use the current finding ledger and body coverage section; avoid duplicate inline comments. Missing or stale evidence is a visible execution limit, not silent success. Preserve code-only reviews and existing preview, publication, identity and conversation-drift rules. A changed comparison base invalidates its supplemental evidence without automatically restarting all code reviewers.

## Risks / Trade-offs

- Untrusted code execution: enforce the native execution boundary and explicit command selection; no claim that temporary directories provide a sandbox.
- Environmental differences or probe incompatibility: retain per-side diagnostics and report inconclusive outcomes rather than bugs.
- Overfitting to a changed implementation: derive the probe from the intended invariant and require independent code confirmation.
- Added latency: run only concrete bounded probes, reuse valid evidence and avoid full-suite duplication or retry loops.
- Cross-runtime divergence: update canonical instructions, Codex adapter and generated distribution copies together, with behavioral tests for evidence handling.

## Delivery

The operator-reported Windows hook failure adds native `commandWindows` overrides to the Codex
manifest. A TypeScript-authored, prebuilt Node adapter invokes the existing rule bundles with
argv and retains their denial semantics. The bootstrap reads plugin-root environment variables
inside JavaScript so shell metacharacters in installed paths are not interpolated into code.
The installer verifies the new field and exact artifact hashes. A Windows CI job executes the
literal override through cmd.exe; local portable tests do not claim native Windows execution.
Reference: https://learn.chatgpt.com/docs/hooks (`commandWindows` and plugin-root variables).

Operational recovery follows the operator's requested extension: Main must diagnose and repair
contract, path and declared-prerequisite failures without another approval when deliverables and
authority are unchanged. Strengthen the existing causal-recovery contract and carry it into
direct/spec entry points and the Codex projection. Preserve native permissions, independent
validation, and the live decision for changes to approved meaning. This is a prompt-level
obligation; deterministic tests do not claim to prove that a model will comply.

One feature branch and one PR include the implementation, fixture-based behavioral tests, instructions, generated copies, version bump and changelog. Rollback removes the additive investigation path while preserving existing read-only PR review. Archive the OpenSpec change after merge through its normal separate lifecycle.
