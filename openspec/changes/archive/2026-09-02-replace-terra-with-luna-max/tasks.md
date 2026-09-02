## 1. Canonical Model Policy

- [x] 1.1 Update the canonical Codex registry and generator invariants so the generic fallback plus every `sonnet-high`, `sonnet-medium`, and `haiku` projection resolves to `gpt-5.6-luna` / `max`, while the `opus` projection remains `gpt-5.6-sol` / `xhigh`.
- [x] 1.2 Make setup/update fallback classification pair-aware: treat Luna/max as current, migrate only the exact managed Terra/medium pair with backup and restart reporting, install missing values, and preserve every other complete custom pair.

## 2. Dispatch and Generated Surfaces

- [x] 2.1 Update the packaged Codex pipeline's standard matrix so implementer, tester, cleaner, and delivery dispatch with Luna/max while architect, QA, and security remain Sol/xhigh; retain `fork_turns: none`, explicit spawn values, model-free `pipeline-*` TOMLs, and live override behavior.
- [x] 2.2 Regenerate and verify project agent TOMLs, packaged setup assets, project config, and the complete Codex roster from canonical inputs; update current runtime/setup documentation without rewriting historical benchmark evidence.

## 3. Deterministic Verification

- [x] 3.1 Update generator, Codex runtime, setup-migration, packaged-copy, and pipeline-contract assertions for Luna/max, Sol preservation, exact Terra/medium migration, custom-pair preservation, idempotence, and the absence of Terra from current standard projection surfaces.
- [x] 3.2 Run `node tools/codex-runtime/generate.mjs --check`, `node tools/codex-runtime/test_generate.mjs`, the focused Codex runtime/setup tests, and `bash tests/run-all.sh`; record any intentionally retained Terra references as historical evidence or legacy migration fixtures.
