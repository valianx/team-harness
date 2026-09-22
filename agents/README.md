# Agents

TH provides specialist skills and workflow guidance to the native general agent.
The general agent presents development through Spec, Implementation, Validation
and Publication while keeping coordination; native permissions control
execution.

## File convention

Canonical role definitions live in `agents/*.md` with YAML frontmatter:
`name`, `description`, `model`, `effort`, `color` and `tools` where applicable.
The description states the role's objective. Use only the expertise and tools
needed for that objective. References and shared guidance are not dispatch targets.

## Roster

Read each role's canonical file for its current objective and native defaults.
Codex's registry, adapters and generated roster project these definitions;
do not maintain a second hand-written model/tool matrix here.

| Work | Roles |
| --- | --- |
| Coordination | Current general agent using `orchestrator.md` as guidance |
| Design and investigation | architect, plan-reviewer, researcher, code-researcher, research-consolidator |
| Implementation and evidence | implementer, tester, cleaner, QA, security, adversary, UX reviewer |
| PR review | reviewer, pr-review-qa, pr-review-security, pr-review-verifier, reviewer-consolidator, inline-reviewer |
| Delivery | delivery |
| Documentation and visuals | documenter, diagrammer, d2-diagrammer, likec4-diagrammer |
| Specialized work | mentor, translator, init-project, agent-builder, gcp-cost-analyzer, gcp-infra |

Specialists receive bounded assignments with ownership and the selected workspace.
PR review roles remain read-only. Findings are recommendations from partial
context; Main verifies evidence, judges dispositions and continues authorized work.
No automatic remote memory, capability lease or gate authority is required.

### Objective column — authoring standard

Keep the objective concrete and limited to the role's own work. Explain a real
boundary only when it helps prevent confusion with another role.

## Earn the model AND the effort AND the tools

Choose native role settings appropriate to the work. Preserve user overrides
and avoid describing a prompt as a runtime-enforced permission boundary.

## Adding or modifying an agent

Edit canonical roles and the relevant adapters. Run
`node tools/codex-runtime/generate.mjs`, `--check`, and
`node tools/codex-runtime/test_generate.mjs`. Sync skill distributions with
`node tools/codex-runtime/sync-skills.mjs` and run relevant repository suites.
Install or refresh through supported native plugin workflows.

## Notes

Workspace local/Obsidian mode and voice preferences apply across flows.
Historical control helpers remain available for old records; current instructions
are in the selected skill and `agents/ref-pipeline.md`.
