## 1. Canonical interaction contracts

- [x] 1.1 Update `agents/_shared/operator-dialogue.md` and `agents/_shared/gate-contract.md` so stable options remain visible while numbers and prefixed forms become optional shortcuts, complete natural-language amendments carry their own detail, and ambiguous replies create no authority.
- [x] 1.2 Update `agents/orchestrator.md`, `agents/ref-direct-modes.md`, `skills/spec/SKILL.md`, and `plugins/team-harness/skills/spec/canonical.md` so unambiguous live intent can enter eligible direct modes without a literal invocation while pipeline activation remains explicit-only.
- [x] 1.3 Reconcile Gate-1 and routing carriers, including `agents/ref-pipeline.md`, `skills/setup/managed-blocks/orchestrator-dispatch-rule.md`, `CLAUDE.md`, and affected pipeline/OpenSpec documentation, preserving nonce attribution, pinned identities, security floors, and outward-action controls.
- [x] 1.4 Require deterministic spec-lane security classification and any selected mandatory lenses before publication, and replace runtime-specific recovery instructions with a compact live continuation choice.

## 2. Distribution and compatibility

- [x] 2.1 Regenerate and verify packaged agent copies, Codex agent TOML, project configuration, and the generated roster from their canonical sources; do not hand-edit generated mirrors.
- [x] 2.2 Update release notes and the patch-version carriers required by the repository's publication checks, documenting that literal invocations, numeric choices, and `3:`/`4:` replies remain backward compatible.

## 3. Behavioral verification

- [x] 3.1 Add or update focused contract tests for intent-routed direct modes, hard-router precedence, short affirmative/negative replies, natural-language amendments, concise ambiguity handling, runtime-neutral continuation handoffs, untrusted-content rejection, explicit-only pipeline activation, and unchanged authority identities without creating an exhaustive phrase or Markdown-wording contract.
- [x] 3.2 Run `openspec validate simplify-operator-interaction --strict` plus the repository's OpenSpec binding, carrier-consistency, and reference-resolution checks, and resolve every failure.
- [x] 3.3 Run `node tools/codex-runtime/generate.mjs --check`, `node tools/codex-runtime/test_generate.mjs`, and the relevant shared-runtime/full repository suites; record the passing evidence before delivery.
