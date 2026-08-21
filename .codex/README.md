# Team Harness Codex agents

<!-- Code generated from runtime/schema/codex-agents.json; DO NOT EDIT. -->

## Improve Team Harness from Codex

Start Codex from the repository root. Use `@Team-Harness init <request>` for lightweight intake or a small bounded improvement; it stays in Main without creating pipeline state or spawning specialists. Use `@Team-Harness pipeline <request>` only when you explicitly want the full gated workflow.

Author shared role intent in `agents/*.md`. Codex model and effort values are projected from that frontmatter, while Codex-specific execution instructions live in `runtime/codex/instructions/*.md` and workflow adapters live in `plugins/team-harness/skills/`. A semantic prompt change is not translated automatically into those adapters, so review both surfaces when behavior should change in Claude Code and Codex.

The seven additional `pipeline-*` custom-agent identities reuse the corresponding logical role adapter but intentionally omit `model` and `model_reasoning_effort`. The pipeline passes both values explicitly on every spawn, using the standard role matrix by default or one ephemeral pair selected in the current live Main session.

After changing any canonical agent's model or effort, an installed role contract, a Codex instruction adapter, or `runtime/schema/codex-agents.json`, run `$sync-codex-agents`. The equivalent repository commands are:

```bash
node tools/codex-runtime/generate.mjs
node tools/codex-runtime/generate.mjs --check
node tools/codex-runtime/test_generate.mjs
bash tests/run-all.sh
```

Read `CONTRIBUTING.md` for the cross-runtime change matrix and `docs/codex-runtime.md` for packaging, local installation, and the complete validation set. Do not edit this generated roster, `.codex/agents/*.toml`, or `plugins/team-harness/skills/setup/assets/agents/*.toml` directly.

## Canonical roster and Codex availability

Generated with the `team-harness` profile. This table includes every canonical Team Harness agent so missing Codex coverage is visible. A projected model/effort is the mapping the role would receive; only rows marked as installed have a generated custom-agent TOML in this beta.

| Agent | Canonical Claude model | Canonical source effort | Codex model | Codex effort | Codex availability |
|---|---|---|---|---|---|
| `adversary` | `sonnet` | `xhigh` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `agent-builder` | `opus` | `xhigh` | `gpt-5.6-sol` | `xhigh` | not shipped in Codex beta |
| `architect` | `opus` | `xhigh` | `gpt-5.6-sol` | `xhigh` | installed custom agent |
| `cleaner` | `sonnet` | `medium` | `gpt-5.6-luna` | `max` | installed custom agent |
| `code-researcher` | `sonnet` | `medium` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `d2-diagrammer` | `sonnet` | `medium` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `delivery` | `sonnet` | `medium` | `gpt-5.6-luna` | `max` | installed custom agent |
| `diagrammer` | `sonnet` | `medium` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `documenter` | `sonnet` | `high` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `gcp-cost-analyzer` | `opus` | `high` | `gpt-5.6-sol` | `xhigh` | not shipped in Codex beta |
| `gcp-infra` | `opus` | `xhigh` | `gpt-5.6-sol` | `xhigh` | not shipped in Codex beta |
| `implementer` | `sonnet` | `high` | `gpt-5.6-luna` | `max` | installed custom agent |
| `init-project` | `haiku` | `medium` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `inline-reviewer` | `sonnet` | `high` | `gpt-5.6-luna` | `max` | installed custom agent |
| `likec4-diagrammer` | `sonnet` | `medium` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `mentor` | `opus` | `high` | `gpt-5.6-sol` | `xhigh` | not shipped in Codex beta |
| `orchestrator` | `opus` | `high` | `gpt-5.6-sol` | `xhigh` | Main via `init` / `pipeline` skills |
| `plan-reviewer` | `sonnet` | `medium` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `pr-review-qa` | `sonnet` | `high` | `gpt-5.6-luna` | `max` | installed custom agent |
| `pr-review-security` | `sonnet` | `high` | `gpt-5.6-luna` | `max` | installed custom agent |
| `qa-plan` | `sonnet` | `high` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `qa` | `opus` | `xhigh` | `gpt-5.6-sol` | `xhigh` | installed custom agent |
| `research-consolidator` | `sonnet` | `high` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `researcher` | `haiku` | `medium` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `reviewer-consolidator` | `sonnet` | `medium` | `gpt-5.6-luna` | `max` | installed custom agent |
| `reviewer` | `sonnet` | `high` | `gpt-5.6-luna` | `max` | installed custom agent |
| `security` | `opus` | `xhigh` | `gpt-5.6-sol` | `xhigh` | installed custom agent |
| `tester` | `sonnet` | `high` | `gpt-5.6-luna` | `max` | installed custom agent |
| `translator` | `sonnet` | `medium` | `gpt-5.6-luna` | `max` | not shipped in Codex beta |
| `ux-reviewer` | `opus` | `high` | `gpt-5.6-sol` | `xhigh` | not shipped in Codex beta |
