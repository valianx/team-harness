# Dispatch contract
<!-- Single source of truth for what a dispatch prompt may and must not carry,
     the pipeline specialist reference handshake, and the two-halves scope
     rule (review scope vs. write scope). Consumed by coordinators and leaf
     specialists by pointer — see agents/README.md § "Adding or modifying an agent" and
     agents/agent-builder.md § "Mandatory Sections Checklist" for where new
     agents pick this up.
     Edit here; consumer files reference this file by section. -->

## Ownership — single source, never copied

This file is the ONE canonical description of what a dispatch prompt may contain, what it
must never contain, the pipeline specialist handshake, and the two-halves scope rule that
governs review scope and write scope. Coordinators and leaf specialists reference this file
by section and never restate its prose. A second copy would diverge from this one the first
time either is edited, and the no-relocation check (Suite 174) exists precisely to catch that kind of duplication across
`agents/ref-*.md` and `agents/_shared/*.md` files.

## What a dispatch carries

A dispatch carries what the recipient cannot derive for itself: the coordinates of the work,
task-scope decisions that are not on the board, and the form of the return. It does not restate
the recipient's own contract, summarize another agent's work, or hand over a verdict on the
property under test — an agent that is told the answer stops looking for it.

None of this is verifiable after the fact. A dispatch prompt is a tool argument and is never
persisted: the one hook that sees it records only its byte length, and nothing reads that value.
So this section is a discipline for the dispatcher, not a control — the rule that does carry
weight is below, because its write half is enforced by the recipient's own tool grants.

## Pipeline specialist reference

An OpenSpec-bound implementer or tester prompt carries only
`dispatch_reference: {schema_version, kind, path, sha256,
scope_identity_sha256}` plus attempt/decision correlation. Roots, ownership,
hashes, source pointers, helpers, seals, evidence, discovery scope, commands,
and workspace writes exist only in the referenced immutable
`team_harness_dispatch_capsule`; prompt-level copies are invalid.

Before any repository or workspace read, the specialist verifies that the
reference is an absolute canonical regular non-symlink workspace path, verifies
its SHA-256 and canonical capsule bytes, and recomputes the scope identity. It
then sends the token-bound `dispatch-ready` acknowledgement. Only that ACK
starts and counts the attempt. A missing, stale, or malformed reference closes
as `dispatch-reference-invalid-before-ready` with no repository work, attempt,
replacement-budget use, or fresh authority. Main may mechanically re-certify
only when semantic scope identity is unchanged.

Silence before readiness is `specialist-start-unconfirmed`, not a specialist
attempt. At the normal role SLA Main uses the single liveness probe and grace,
then interrupts and audits declared paths. A clean audit preserves the same
decision/reference and pauses without advancing attempt or replacement counts;
progress before readiness is a contract violation. Repeated clean starts never
become `specialist-retry-exhausted` and never authorize an unbounded redispatch
loop.

After readiness the specialist takes every operational coordinate from the
capsule, stays inside its role-specific ownership, authorizes each workspace
write mechanically, and returns exact writes/evidence to Main. Main alone owns
state, events, reports, correction authority, Freeze, gates, and publication.

## Two-halves rule

One rule, stated once, governs both review scope and write scope:

> **The dispatcher never bounds review scope. The contract always bounds write scope.**

**Review half.** A dispatch never tells its recipient to look only at the changed part and
treat the rest as frozen or already-trusted. The dispatch carries a **coordinate** — what
changed, in AC/section terms — and the recipient computes its own review objective from
that coordinate. It never carries a **bound** — an instruction narrowing what the recipient
is allowed to look at. This is not implemented by writing a scope-limiting rule into each
verifier's own contract: no verifier contract gains a review-scope clause under this rule,
because writing the same restriction at every destination would be the enumeration this
single dispatcher-side rule replaces. The safe direction when this half is silent is more
scrutiny, never less — a verifier with no bound reviews everything, which is the fail-safe
this half's removal relies on.

**Write half.** A dispatch's write scope is always bounded — by declared file paths and
tool scoping in the recipient's own contract, never by dispatcher prose. This half is
already canonical and already consumed by pointer from five agent files; it is not
restated here. See `agents/_shared/plan-consolidation.md § "Write-scope on the plan set (closed list)"`
and § "Write-tool discipline (shared review files)" for the write-half mechanism itself.

## Attribution

This file's decisions come from failures observed in this repository's own pipeline runs —
not from any single external article. Where a decision echoes context-engineering guidance
written for a single-agent assistant, that guidance does not address multi-agent
orchestration and is not cited here as authority for any of the choices above; what is
credited is the general governance instinct behind that guidance (say the rule once, in one
place, and let every consumer point at it), applied to a problem that guidance itself does
not cover.

## How to reference this file

In `agents/orchestrator.md`, replace inline dispatch-content prose
with a one-line cross-reference:

```
**Dispatch contract:** see `agents/_shared/dispatch-contract.md` for what a dispatch may
and must not carry, and the two-halves scope rule (review scope never bounded by the
dispatcher; write scope always bounded by the recipient's own contract).
```

Do not re-derive or paraphrase the rule set inline — this file is the single source of
truth for it.
