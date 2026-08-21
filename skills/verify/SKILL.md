---
name: verify
description: Run the inline verification fan over a committed range and decide its ship join — no workspace, no pipeline state.
---

# Verify (explicit direct mode)

Requests the inline verification fan over an immutable committed range and reports whether the
range is ready to publish. The lens contract is `agents/_shared/inline-review-contract.md`; this
skill is its invocation surface, not a second copy of it.

The skill creates no workspace, `00-state.md`, execution event, gate, Stage Gate, branch, commit,
push, or delivery record. It never publishes.

## Flow

1. **Build the package.** Run `review-fan.mjs package` with the committed range, the operator's
   lens set, and — when the work has an authored change — its change id. Resolve the script in
   order, taking the first that exists:

   1. latest `~/.claude/plugins/cache/team-harness-marketplace/th/*/skills/verify/scripts/review-fan.mjs`
   2. `~/.claude/skills/verify/scripts/review-fan.mjs`
   3. the opencode skill install:
      `${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/skills/verify/scripts/review-fan.mjs`
      (Windows: `%APPDATA%\opencode\skills\verify\scripts\review-fan.mjs`; a project-scope
      install uses `<repo>/.opencode/skills/verify/scripts/review-fan.mjs`)
   4. `scripts/review-fan.mjs` resolved against this skill's own directory (the directory
      containing this document) — the packaged copy on Codex and opencode installs
   5. `./skills/verify/scripts/review-fan.mjs`
   The script resolves the repository, refuses a dirty index or worktree, refuses a range whose
   endpoints are not commits, derives the changed surface from the repository, binds the change's
   validated requirements as `written-intent` criteria, classifies the security floor, and resolves
   the required lens set. Every refusal comes from the script; none of it is operator discipline.
2. **Dispatch.** Dispatch one `inline-reviewer` instance per lens in `required_lenses`, each
   carrying the emitted package. Several lenses are one review, not several specialists.
   When the package reports `fully_verified: true`, every changed path was proven by a green
   checker: report the surface as fully checker-verified, naming those checkers, and dispatch
   no lens rather than reviewing an empty surface.
3. **Decide.** Collect the lens returns and run `review-fan.mjs gate` over them. It resolves
   `ready` only when every required lens returned a pass with no blocker; an absent required return
   is never a pass. Report the reasons verbatim when it resolves not-ready.
4. **Report.** Present the decision, the blocking reasons, and the classification. `gate` splits
   blocking findings into `covered` — a bound written-intent criterion anticipated it — and
   `spec_defects` — none did. A covered finding is fixed and closed by executing that criterion's
   scenario plus the deterministic suites. A spec defect above the floor returns to the authored
   change for an operator-approved revision. Concerns go in the pull-request body. None of the
   three opens another verification pass.

## Scope

- `--scope full` is the first pass over a range, and the only review the flow runs by default.
- `--prior-anchor <sha>` bounds a package to the range since that anchor. This exists for a
  reviewed look at a fix that the operator explicitly asks for; it is not a step the flow falls
  into. The script refuses full scope once an anchor exists, and a finding whose files fall
  outside the bounded range is demoted to a concern.

## Security floor

When the script reports `security_floor.applies`, `security` and `adversary` are already in
`required_lenses` — the floor is derived from the diff, not from recall, and an unscannable path
leaves the classification ambiguous, which resolves sensitive. The derivation reads every line the
change touches: removing a security control raises the same floor as adding one, because a scan
that reads additions only fails open on exactly the change a security review exists to catch. A
floor lens that is absent or returns a blocker holds the range at not-ready.
