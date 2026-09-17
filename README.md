# Team Harness

Team Harness adds development workflows and specialist judgment to **Claude
Code**, **Codex** and **OpenCode**. It builds on each runtime's native agent,
permissions and tools.

The central workflow is **spec**: clarify the objective, record intent and tasks,
implement, validate, and use independent adversarial review where it improves
the result. The general agent keeps the full context and decides how to address
reviewer recommendations.

## Install

### Claude Code

```text
/plugin marketplace add valianx/team-harness
/plugin install th
/th:setup
```

### Codex

```text
codex plugin marketplace add valianx/team-harness
codex plugin add team-harness@team-harness
```

Then use `$team-harness:setup` to configure TH preferences and native specialist
roles. See [the Codex guide](docs/codex-runtime.md).

### OpenCode

Use the [runtime-aware installer](bin/README.md) with `--runtime opencode`.
It projects skills and agents into the selected native scope.

See [installation](docs/install.md) for runtime details. Memory and Context7
are optional integrations used by relevant workflows.

## Workflows

| Skill | Purpose |
| --- | --- |
| `init` | Frame the request and choose a useful approach |
| `spec` | Develop through written intent, tasks, checks and independent review |
| `pipeline` | Coordinate a larger effort when the operator chooses it |
| `review-pr` | Review an existing PR against identified evidence |
| `apply-review` | Evaluate and resolve comments on the author's PR |
| `create-pr` | Prepare scope, check archive readiness and publish the authorized PR |
| `research` / `research-code` | Investigate external evidence or implementation |
| `pipelines` / `trace` | Read progress, evidence and OpenSpec status |
| `modes` | Discover the complete current skill catalog |

Use native skill discovery or name the flow. Claude uses `/th:spec`; Codex uses
`$team-harness:spec`. General agents read the current selected skill and retain
their native behavior. The discovery and voice guides help them choose TH without
requiring a replacement agent identity.

## Update and reload

Use the installed `update` skill to install the current release and maintain
TH-owned resources. Use `reload` or the host's available plugin refresh to read
current instructions and refresh components in the same conversation.

TH preserves native permission policy, sandbox settings, models and feature
flags. It installs no command guards in Codex or OpenCode. Claude hooks provide
discovery, language and optional observability. A restart is reported only when
a specific component has a demonstrated refresh limitation.

## Durable work

Keep product code, maintained tests, reusable tools and deliberate documentation
in the repository. OpenSpec records intent and acceptance. Archive completed,
verified changes with their implementation in the same PR.

Keep logs, transcripts, temporary screenshots and scratch scripts in temporary
or configured workspace storage. A concise plan records progress when continuity
helps; no authority journal or capability lease is needed.

## What gets a test

Tests exercise executable behavior and machine-readable artifacts: installers,
helpers, observational hooks and package projections. Assertions should derive
from the intended behavior and expose a real defect.

Review agent and skill prose through reading and independent judgment. Keyword,
heading and prose-snapshot tests do not establish that a workflow makes sense.
Generated asset checks may verify faithful projection; they do not validate the
meaning of the source instructions.

## Documentation and contribution

See [CONTRIBUTING.md](CONTRIBUTING.md), [testing](docs/testing.md),
[OpenSpec](docs/openspec-integration.md), [coordination](docs/subagent-orchestration.md)
and [setup/update](docs/setup-update-model.md). Source roles live in `agents/`,
canonical skills in `skills/`, and native projections in their runtime trees.

Report issues through [GitHub](https://github.com/valianx/team-harness/issues).
For private security reports, see [SECURITY.md](SECURITY.md).
See [LICENSE](LICENSE) for licensing.
