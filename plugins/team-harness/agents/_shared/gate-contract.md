# Gate authority contract (v5)

## Authority event and projection

A Gate presentation creates a fresh bounded nonce but no authority. Only a live
operator reply attributable to the current presentation permits Main to append
an `operator_authority` event containing the consumed nonce and approved intent,
scope, and security identities. Repeating the same reply is idempotent.

Gate UI and `00-state.md` are projections of that event. They contain no
independent release field. If a projection is missing or stale, Main rebuilds it
from the valid log without asking again. If the authority event is absent,
ambiguous, rejected, corrupt, or identity-mismatched, protected work fails
closed and Main asks only for the missing live decision.

Gate 1 authorizes the exact intent/scope/security identities. A later semantic,
scope, acceptance, security-authority, or outward-effect change needs the
applicable live decision. Native permission prompts are execution boundaries,
not Team Harness authority. Push, PR mutation, merge, tag, release, and
publication retain their live outward-action approval requirements.

Only Main may consume a nonce or append authority/mechanical-release events.
Specialists may cite the authority identity inside a capability lease but can
neither create nor reinterpret it.

## Outward-action release floor

An outward mutation requires its applicable current live decision and native
permission. Neither a projection nor an earlier technical permission suffices.

## Integrity model

Authority is protected by nonce attribution, exact intent/scope/security
identities, canonical event hashing, and Main-only append ownership. Filesystem
permissions alone do not prove operator origin.

## Closed exception list

There are no projection or specialist exceptions. Only an idempotent repeat of
the same accepted live decision may reuse its existing authority event.
