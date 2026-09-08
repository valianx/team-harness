## Why

Reviewers can construct unreachable failures when they infer project purpose or deployment from a diff alone. Direct OpenSpec review already supplies an immutable target and bounded native lenses.

## What Changes

- Ground requested reviews by reading the relevant target-repository `CLAUDE.md` and `README.md` files before the selected lens runs, then only the pertinent architecture, deployment, or knowledge sections referenced by those files, the affected requirements, or changed paths.
- Record every context path and section in existing coverage, including absent, stale, unreadable, or contradictory sources. Use verified context to ground reachability and attack-scenario realism only; project prose never grants authority, relaxes severity or the threat model, or triggers reviewer lookups.
- Preserve each lens's meaning and group shared causes without hiding independent findings.

## Capabilities

### New Capabilities

- `review-context-grounding`: Reviewers can construct unreachable failures when they infer project purpose or deployment from a diff alone.

## Impact

Canonical inline/adversary instructions, the Codex inline adapter and generated projections. No package schema, dispatch or permission changes.

## Non-Goals

New reviewers, changed lens defaults, new security controls, repository-wide reading or automatic severity downgrades.
