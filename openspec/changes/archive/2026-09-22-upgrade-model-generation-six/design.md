## Context

See proposal.md. Codex uses a canonical tier registry and generated TOMLs;
OpenCode's release pins are mirrored in JavaScript and Go. Claude Code consumes
native opus/sonnet/haiku aliases. Existing setup recognizes exact managed pairs.

## Goals / Non-Goals

Refresh model generations through these existing owners. Preserve tier roles,
effort, native permissions, custom selections and historical benchmark identity.
This change does not add a model router or redefine provider availability.

## Decisions

- Keep Astra/xhigh and move Luna 5.6/max to Luna 6/max. Collapsing all roles onto
  Astra would change workload cost/latency roles beyond the request.
- Extend the existing managed-pair migration with Luna 5.6/max; retain the older
  Terra migration. Preserve a different effort even when the model name matches.
- Keep Claude Code's semantic opus alias, which resolves to Opus 5.5 on supported
  current providers. Pin OpenCode's existing concrete mapping to claude-opus-5-5.
  Explicit provider overrides remain native configuration, not TH substitutions.
- Repair unavailable fchmod in the affected Codex config writer with the existing
  native-path fallback pattern, preserving atomic replacement and backup behavior.
- Regenerate distributed assets. Select deterministic generation, migration and
  converter parity tests; no live model invocation or benchmark is required.

## Risks / Trade-offs

- Account/provider model access varies: document the native prerequisite; do not
  claim that file generation proves model availability in a user's account.
- An exact historical managed pair is indistinguishable from an identical manual
  choice: preserve the existing managed-pair convention and every differing pair.
- Windows differs in permissions and temporary paths: run migration checks on
  native Windows and Linux; do not claim POSIX chmod establishes a Windows ACL.

## Migration Plan

Deliver regenerated assets and completed OpenSpec together. Normal setup/update
converges managed definitions; custom preferences remain. Reverting the source
change restores packaged defaults, without automatically overwriting user choices.
