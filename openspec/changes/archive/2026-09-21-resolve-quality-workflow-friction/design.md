## Context

See proposal.md. Original review returns are historical evidence and must survive fixes. The existing helper already aggregates returns and classifies locations, so the repair belongs there. Shared setup synchronization already compares bytes and modes but applies POSIX mode assumptions on Windows.

## Goals / Non-Goals

**Goals:** Remove misleading delivery authority, preserve evidence and make native checks portable.

**Non-Goals:** No closure registry, new gate, provider wrapper, upstream method copy or score enforcement.

## Decisions

- Expose a factual `summary` and keep `gate` as its compatibility alias. Removing the readiness output and conclusion-dependent failure is clearer than adding another override/closure input. Invalid inputs remain execution failures.
- Reuse aggregation and normalize supported location shapes. Preserve original returns and unknown criterion coverage; inferring a requirement from a file would fabricate evidence.
- Compare POSIX modes only on POSIX. Keep byte checks everywhere and test the native branches rather than weakening content validation.
- Enable Git long-path support only inside the owned Windows snapshot. A real nested-path materialization test checks the source Git directory is unchanged; no global Git or OS setting is needed.
- Keep integration exercises and raw reports in the existing Obsidian workspace. Use actual TH/PR source and installed native providers; a missing host credential is a disclosed execution limit, not a reason to copy authentication or replace native controls.

## Risks / Trade-offs

- Consumers reading `ready` need migration to factual evidence and coordinator disposition; update all shipped consumers together. Historical reports remain unchanged.
- Equivalent-looking paths can be malformed or outside scope; normalization must not silently lower their significance.
- Native model exercises are observational evidence, not deterministic tests of prose. Maintain executable regression tests for helper behavior and filesystem handling.
