
# Verify (explicit direct mode)

Requests the inline verification fan over an immutable committed range and reports whether the
range is ready to publish. The lens contract is `agents/_shared/inline-review-contract.md`; this
skill is its invocation surface, not a second copy of it.

The skill creates no workspace, `00-state.md`, execution event, gate, Stage Gate, branch, commit,
push, or delivery record. It never publishes.

## Flow

1. **Build the package.** Run `skills/verify/scripts/review-fan.mjs package` with the committed
   range, the operator's lens set, and — when the work has an authored change — its change id.
   The script resolves the repository, refuses a dirty index or worktree, refuses a range whose
   endpoints are not commits, derives the changed surface from the repository, binds the change's
   validated requirements as `written-intent` criteria, classifies the security floor, and resolves
   the required lens set. Every refusal comes from the script; none of it is operator discipline.
2. **Dispatch.** Dispatch one `inline-reviewer` instance per lens in `required_lenses`, each
   carrying the emitted package. Several lenses are one review, not several specialists.
3. **Decide.** Collect the lens returns and run `review-fan.mjs gate` over them. It resolves
   `ready` only when every required lens returned a pass with no blocker; an absent required return
   is never a pass. Report the reasons verbatim when it resolves not-ready.
4. **Report.** Present the decision, the blocking reasons, and the concerns. Concerns are for the
   pull-request body; they never open another verification pass.

## Scope

- `--scope full` is the first pass over a range.
- `--prior-anchor <sha>` closes one applied fix: the script refuses full scope and bounds the
  package to the range since that anchor. A finding whose files fall outside that range is
  demoted to a concern rather than blocking, so a closure pass cannot escalate into a new round.

## Security floor

When the script reports `security_floor.applies`, `security` and `adversary` are already in
`required_lenses` — the floor is derived from the diff, not from recall, and an unscannable path
leaves the classification ambiguous, which resolves sensitive. A floor lens that is absent or
returns a blocker holds the range at not-ready.
