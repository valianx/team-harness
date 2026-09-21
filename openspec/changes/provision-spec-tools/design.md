## Context

The dependency policy is declarative guidance read by agents; distribution copies
it byte-for-byte. There is no policy execution engine. See proposal.md for scope.

## Decisions

- Add an optional `providers` object without changing existing OpenSpec keys or
  schema version. Record identities, tested versions, required skills, prerequisite
  and official owner links, not shell command templates. This preserves consumers
  and avoids building another installer.
- Make spec entry consume the policy and the shared upstream reference. The same
  preparation method is reusable by provider-only setup and selected pipeline
  capabilities, without making routine TH updates reinstall every provider.
- Install via OpenSpec package/profile/init, BMAD TEA module and Superpowers host
  plugin lifecycle. Native task permissions control those operations. Installation
  is distinct from activation and executing the tool's method.
- Keep the consumer artifact boundary in workspace and reuse it from create-pr;
  assess durable purpose instead of banning generated files or adding a scanner.

## Risks / Trade-offs

- Marketplace versions and installation contracts evolve → check current official
  instructions and the required capabilities; tested versions are evidence, not a
  permanently frozen private copy.
- BMAD uses project configuration → preserve other modules/skills and verify all
  report destinations resolve to the already-selected workspace. Its 6.12 Windows
  directory creation mishandles absolute paths; relative configuration resolving
  to the same external home is usable. Keep provider assets external.
- Session refresh varies by host → report demonstrated readiness and use the
  installed skill directly when supported, without claiming a backend refresh.

## Validation

Use existing distribution/generation checks, strict OpenSpec validation and an
independent forward test for missing/present providers, active host selection,
planning scope, unsupported prerequisites and unavailable activation. Reuse
official provider installation probes where unchanged, plus the user-authorized
Codex setup as current integration evidence. Do not add tests that assert prose.

Documentation budget: extended — the preparation step needs one shared operational
description; max 225 lines in upstream-tools.md and 95 in openspec-integration.md.
