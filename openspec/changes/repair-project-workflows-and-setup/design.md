## Context

See proposal.md. The audit is anchored at c99b5c6 and its evidence is retained in the operator's existing Obsidian workspace. Seven confirmed defects coexist with stale active prose; historical control-plane artifacts remain intentionally readable.

## Goals / Non-Goals

**Goals:** repair supported execution and converge generated content with small, testable changes. Keep one delivery branch and one PR.

**Non-Goals:** no replacement permission layer, bulk historical rewrite, changed model tiers, or fabricated live-host activation/performance evidence. Copy-only site corrections require no new frontend design; no database changes are involved.

## Decisions

- Keep platform launchers compatible with Windows PowerShell 5.1 and PowerShell 7 using correct native argument serialization; do not invoke an extra shell. Exercise the actual forwarding boundary with a local child fixture.
- Compare desired MCP object members recursively while treating array/scalar values as exact. Preserve existing merge ownership and secret handling.
- Normalize native paths before serializing installation ownership records. The full Windows Go run exposed separator failures hidden by the Linux-only package lane; preserve portable root-relative records and compare filesystem paths semantically in tests.
- Synchronize entire owned package trees against canonical sources, including removed files. Do not apply this deletion rule to user installations.
- Confine retained hook writes with filesystem boundary checks and regular, non-aliased output checks. Native runtime permissions continue governing all execution.
- Normalize native SubagentStop fields at the existing runtime adapter and retain Agent/Task start matching. The native event regression exposed a synthetic-only fixture; use the official Claude hook contract and preserve older fixtures as compatibility coverage.
- Correct evidence at the existing quality runner boundary; retain compatibility for successful checks and add a failed-probe regression.
- Update active navigation and setup instructions, preserving historical documents as historical. Repair the researcher default-team residue identified by #661/#662; leave their empirical comparison explicitly outstanding.
- Separate review completeness from delivery authority. Recover unavailable reviewers through supported native read-only execution; if recovery fails, preserve incomplete coverage and let Main apply the existing publication authorization and any explicit operator prerequisites. Never substitute a writable prompt-only reviewer or claim a pass.
- Use focused regression tests first, then existing Linux repository suites, Go tests and Windows launch/generation checks. Isolate interactive test input explicitly. Correct the test interpreter fallback and release-only CI classifier without adding a workflow gate.
- Documentation budget: extended — several active entrypoints contradict the current shared workflow; max 650 changed documentation lines excluding generated copies and OpenSpec.

## Risks / Trade-offs

- Windows quoting differs across launch APIs → test literal spaces, empty values, quotes and trailing backslashes with native child parsing.
- Generated cleanup could be too broad → limit it to repository-owned projections and test stale/remain behavior.
- Filesystem links differ by host → execute real link cases on Linux and Windows hard links where available, recording actual omissions.
- Existing suites do not prove model-followed behavior or comparative cost → retain that limitation and keep the research issues open.

## Migration Plan

Ship repaired canonical assets and regenerated distributions together. Normal native update installs them. No user-home mutation occurs during development; rollback uses the preceding plugin release. Canonical specs and archive accompany implementation in the same PR.
