
# List Team Harness modes

Respond in the operator's language. Render the applicable rows from the
canonical catalog below in alphabetical order, translating only the purpose
text. Keep mode names and invocations exact.

- In Claude Code, show each applicable mode as `/th:<name>`.
- In opencode, show each applicable native skill by its exact skill ID. Show
  `/th-modes` for this catalog and `/th-update` for the dedicated updater.
- If the runtime is unclear, retain the Availability column instead of
  guessing an invocation.

| Mode | Purpose | Availability |
|---|---|---|
| `apply-review` | Apply PR review feedback using the conservative author-side workflow. | Claude Code + opencode + Codex |
| `audit` | Analyze codebase architecture, health, and technical debt. | Claude Code + opencode + Codex |
| `audit-security` | Run the repository's shipped-asset security self-scan. | Claude Code + opencode + Codex |
| `background` | Dispatch bounded work through the active runtime's native background mechanism. | Claude Code + opencode + Codex |
| `bootstrap` | Initialize repository conventions and its runtime-native instruction file. | Claude Code + opencode + Codex |
| `clickup` | Configure, list, and route ClickUp tasks. | Claude Code + opencode + Codex |
| `cross-repo` | Analyze dependencies and changes across repositories. | Claude Code + opencode + Codex |
| `d2-diagram` | Create technical diagrams with the D2 language. | Claude Code + opencode + Codex |
| `define-ac` | Define acceptance criteria for a feature or task. | Claude Code + opencode + Codex |
| `deliver` | Resume validated work at its release gate and publish only after approval. | Claude Code + opencode + Codex |
| `design` | Design the architecture and work plan for a task. | Claude Code + opencode + Codex |
| `diagram` | Create an Excalidraw diagram for a concept or workflow. | Claude Code + opencode + Codex |
| `docs` | Generate Obsidian documentation through the documentation pipeline. | Claude Code + opencode + Codex |
| `eval` | Evaluate and score agent or pipeline performance. | Claude Code + opencode + Codex |
| `excalidraw-diagram` | Create Excalidraw JSON diagrams that make visual arguments. | Claude Code + opencode + Codex |
| `gcp-costs` | Analyze GCP costs and optimization opportunities. | Claude Code + opencode + Codex |
| `gcp-infra` | Manage GCP infrastructure through a gated plan and apply flow. | Claude Code + opencode + Codex |
| `hookify` | Report candidate deterministic hooks from observed session friction. | Claude Code + opencode + Codex |
| `implement` | Implement directly or continue an explicitly active pipeline after design approval. | Claude Code + opencode + Codex |
| `init` | Load lightweight intake and bounded direct help without activating the gated pipeline. | Claude Code + opencode + Codex |
| `inline` | Declare, exit, or query the operator-controlled inline posture. | Claude Code + opencode + Codex |
| `interactive-presentation` | Build interactive web presentations with animated visual flows. | Claude Code + opencode + Codex |
| `issue` | Fetch a GitHub issue and explicitly activate the gated pipeline. | Claude Code + opencode + Codex |
| `json-canvas` | Create and edit Obsidian JSON Canvas files. | Claude Code + opencode + Codex |
| `kg` | Search, inspect, and manage the Knowledge Graph. | Claude Code + opencode + Codex |
| `learn` | Ask the mentor to explain code or a technical concept. | Claude Code + opencode + Codex |
| `learn-english` | Configure English-learning corrections and optional immersion. | Claude Code + opencode + Codex |
| `likec4-diagram` | Generate architecture-as-code diagrams with LikeC4. | Claude Code + opencode + Codex |
| `lint` | Validate the health of Team Harness agents, skills, and hooks. | Claude Code + opencode + Codex |
| `mcp-optimize` | Audit MCP context cost and propose guarded configuration improvements. | Claude Code + opencode + Codex |
| `modes` | Show this alphabetical read-only catalog. | Claude Code + opencode + Codex |
| `obsidian-bases` | Create and edit Obsidian Bases views, filters, and formulas. | Claude Code + opencode + Codex |
| `obsidian-cli` | Interact with a running Obsidian instance through its CLI. | Claude Code + opencode + Codex |
| `obsidian-markdown` | Create and edit Obsidian-flavored Markdown. | Claude Code + opencode + Codex |
| `pipeline` | Explicitly start the full gated Team Harness pipeline. | Claude Code + opencode + Codex |
| `pipelines` | Show the current state of all durable pipelines. | Claude Code + opencode + Codex |
| `plan` | Break broad scope into labeled implementation tasks. | Claude Code + opencode + Codex |
| `plan-review` | Audit a Stage 1 plan against its shape and substance rules. | Claude Code + opencode + Codex |
| `recover` | Resume an interrupted persisted pipeline. | Claude Code + opencode + Codex |
| `report-issue` | Prepare and file a guarded Team Harness GitHub issue. | Claude Code + opencode + Codex |
| `research` | Investigate a technology, migration, or approach. | Claude Code + opencode + Codex |
| `research-code` | Investigate a codebase with parallel, file-grounded evidence. | Claude Code + opencode + Codex |
| `resume-session` | Read and summarize a saved session handoff without modifying state. | Claude Code + opencode + Codex |
| `review-pr` | Review a PR against a fixed snapshot and publish only after approval. | Claude Code + opencode + Codex |
| `save-session` | Save a confirmation-gated session handoff. | Claude Code + opencode + Codex |
| `security` | Audit a target against OWASP, CWE, and ASVS. | Claude Code + opencode + Codex |
| `setup` | Configure Team Harness integrations and operator preferences. | Claude Code + opencode + Codex |
| `spike` | Prototype quickly to test a technical hypothesis. | Claude Code + opencode + Codex |
| `test` | Design and run tests for a feature or component. | Claude Code + opencode + Codex |
| `test-cross-browser` | Run a suite across browser engines and branded channels. | Claude Code + opencode + Codex |
| `test-pipeline` | Run the test pipeline for a feature. | Claude Code + opencode + Codex |
| `tmux` | Orchestrate runtime-native coding-agent sessions through tmux. | Claude Code + opencode + Codex |
| `todo` | Manage one-note-per-task Obsidian Tasks entries. | Claude Code + opencode + Codex |
| `trace` | Show pipeline observability for one feature. | Claude Code + opencode + Codex |
| `translate` | Discover, extract, and translate UI strings for i18n. | Claude Code + opencode + Codex |
| `update` | Update the installed Team Harness runtime. | Claude Code + opencode + Codex |
| `validate` | Validate an implementation against its acceptance criteria. | Claude Code + opencode + Codex |

Do not load another skill, create pipeline state, dispatch an agent, or perform
any listed action while rendering this catalog. A later explicit operator
request owns activation and its prerequisites.
