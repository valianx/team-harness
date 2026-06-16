# Loosening-Impact Lens

**Purpose:** Detect when the diff deletes or loosens a potentially load-bearing
element — a guard, gate, validation, whitelist, error handler, test case, or
early-return — without tracing what that element was holding back or who depends
on it. The non-execution of a gate can itself be the safety property; removing
it without a consumer trace is the failure mode this lens surfaces.

## When this lens fires

Load this file when the diff contains any of:

- Removed lines containing `if (`, `guard`, `assert`, `validate`, `whitelist`,
  `allowlist`, `require`, or `check` (as a guard/precondition pattern)
- Removed `try` / `catch` blocks or error-handling branches
- Removed test cases or test assertions
- Removed conditions from a boolean gate or feature-flag read
- Deleted or short-circuited flag/feature-toggle reads
- Removed early-return guards (`if (!condition) return`, `if (err) return err`)

Signals are domain-agnostic. The lens fires on the structural pattern, not on
a specific technology or domain keyword.

## What to look for

### Consumer trace

For each deletion or loosening the diff introduces, enumerate:

- **Direct callers and downstream consumers** — what code reaches the path that
  was previously gated? Who calls into this after the guard is removed?
- **Tests** — are there tests that exercised the guard's rejection behavior?
  Removing the guard without removing or updating those tests is an inconsistency
  that warrants a finding.
- **Other flows sharing the same config, flag, or whitelist entry** — a guard
  removed from one call site may still be expected by other callers that share
  the same invariant.

### Non-execution as the safety property

Ask: **was the non-execution of this code path itself the safety property?**

Examples where removing a gate is the risk, not just a style change:
- An early return that prevents unvalidated input from reaching a sink.
- An `allowlist` check that prevented unauthorized resource access.
- A `try/catch` that ensured a caller never saw an unhandled exception.
- A feature-toggle read that kept incomplete functionality unreachable in
  production.

If the answer is "yes, the non-execution was the safety property," raise a
finding regardless of whether the remaining code looks correct in isolation.

### Finding-connection cross-check (point c)

After establishing the consumer trace, apply the cross-check defined in
`agents/_shared/finding-connection.md` § "Cross-check definition": scan the
OTHER findings and comments in the same review for a declared risk on the path
this change widens. If found, force both to be resolved together and name the
link explicitly in the finding.

Do NOT restate the cross-check logic here — it lives in `finding-connection.md`
as the single source of truth.

### Genuine dead code and style-only changes

When the consumer trace confirms:
- No callers reach the removed gate (the gate was unreachable before and after)
- No tests covered the removed path
- No other flow shares the invariant
- The non-execution was not a safety property

Then the removal is genuine dead code. Raise **zero findings** for dead-code
removal. The lens is a consumer-trace tool, not an automatic objection to
every deletion.

## Severity guidance

Severity is governed by the **existing rules** in `reviewer.md §
"Severity Classification"`. This lens is additive — it provides the consumer
trace and the non-execution-as-safety-property check; it does NOT override
existing severity levels and NEVER replaces the deterministic bright-line
(the `review-policy.md` rule-removal-equals-critical rule at
`reviewer.md § "Policy-aware review"`).

Indicative guidance (NOT an automatic override):

| Pattern | Indicative severity |
|---------|-------------------|
| Guard removed with no consumer trace; gate was the only thing preventing unvalidated data from reaching a sink (auth, payment, data mutation) | CRITICAL |
| Error handler removed on a critical path where the caller depended on the error signal | CRITICAL |
| Test case removed that was the only coverage for a rejection/error path | SUGGESTION |
| Feature-toggle check removed while the feature is still incomplete or behind a policy gate | SUGGESTION |
| Allowlist/whitelist entry removed without tracing all consumers of that entry | SUGGESTION |
| Guard removed where the consumer trace shows no live consumers and no safety property | zero findings (dead code) |

Apply existing reviewer judgement; do not escalate solely because the lens fired.

## Scope discipline

Raise findings only for deletions or loosenings the diff introduced (see
`reviewer.md § "Scope Discipline"`). Pre-existing unguarded code in untouched
files goes in `## Fuera de alcance` at most once — it does not affect the
verdict. Do not duplicate a finding already raised under `### Error Handling`
or `### Security` in the main review.

Fold findings into the existing `### Error Handling` or `### Security` sections
of `review_body`; do not add new top-level sections for this lens.
