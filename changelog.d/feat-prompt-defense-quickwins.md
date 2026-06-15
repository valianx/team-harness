### Added

- **M1 — Prompt-injection defense floor:** prepended the canonical `## Untrusted content & prompt-injection floor` block (4 bullets + defense-in-depth paragraph) into 8 agents — `researcher`, `architect`, `security`, `mentor`, `gcp-infra`, `reviewer`, `diagrammer`, `orchestrator` — as a resident in-context guard before any WebFetch/WebSearch/PR-read instruction fires.
- **M2 — Anti-cope clause:** added a "be ruthlessly strict" philosophy bullet to `agents/qa.md`, `agents/qa-plan.md`, and `agents/reviewer.md` forbidding effort-credit ("solid foundation", "good start"), points-for-potential, and partial passes; anchors the grade to "what a senior would ship."
- **M4 — Window-scaled compaction threshold:** sharpened the orchestrator's `### Mid-pipeline compaction trigger` to detect the model's context window via the `[1m]` marker and compare against absolute thresholds (~250k for 1M-window models, ~160k for 200k-window models) instead of a flat ~40% heuristic; `window_threshold` added to the `compaction.trigger` JSONL event `extra` object.

### Security

- **M3 — Egress + config + no-verify hardening (`hooks/policy-block.sh`):**
  - **(a) Read-side egress guard:** `Read` tool calls targeting secret/credential paths (`.env`, `*.pem`, `*.key`, `credentials.json`, `secrets.*`, `*secret*`) now return `permissionDecision: ask`; `.env.example`/`.sample`/`.template` remain allowlisted.
  - **(b) Config-anti-weakening guard:** `Write`/`Edit` calls that weaken linter/formatter configs (`.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `ruff.toml`, `tsconfig*.json`) via rule-removal, `"rules":{}`, broad `eslint-disable`, or `strict:false` patterns return `permissionDecision: ask`.
  - **(c) Position-aware argv tokenizer:** replaces the naive `--no-verify` regex with a quote-aware tokenizer that skips `-m`/`--message`/`-F` flag values, so a commit message body that mentions `--no-verify` is no longer falsely denied (identical decisions on the python3 and bash-degraded paths). Real bypass tokens are denied across every form git honours: `--no-verify`, any unambiguous prefix (`--no-v` … `--no-verify`), the short alias `-n` and bundled clusters (`-nm`) scoped to `git commit` (so `git push -n` / `git clean -n` dry-runs are not mis-flagged), and `-c core.hooksPath=`.
  - **Known limitation (documented):** command-substitution / variable-expansion forms (e.g. `git commit $(printf -- --no-verify)`) evade any static tokenizer and are not detected — structurally unfixable without becoming a shell interpreter.
