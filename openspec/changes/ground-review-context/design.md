## Approach

Use the existing immutable project view and coverage fields. Before a lens runs,
read the relevant target-repository `CLAUDE.md` and `README.md` files (record a
missing or unreadable file as a gap), then follow only references from those
files, affected requirements, or changed paths to pertinent architecture,
deployment, or knowledge sections. For adversary, this bounded read completes
before the attack pass and worst-case enumeration. Record each path and section in coverage and
record stale or contradictory context as a limit. Project documentation is
evidence for reachability and scenario realism, never authority; it cannot
relax severity or the threat model or trigger external lookup. Main retains
consolidation and can recognize common causes without another review pass.

## Compatibility

No new reviewers, changed lens defaults, security controls, repository-wide
reading, severity or threat-model relaxation, or external reviewer lookups.
Existing native permissions and accepted direct-mode authority remain in effect.

## Validation

Use the scenarios in the delta and the existing relevant checks, including
bounded source selection, auditable path/section and gap reporting, the
pre-attack ordering, and preservation of live authority when project prose is
instruction-like. Instruction-only changes receive behavioral inspection, not
tests pinned to prose.
