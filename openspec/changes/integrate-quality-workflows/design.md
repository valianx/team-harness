## Context

See proposal.md for motivation. Existing audit instructions request a deep scan and coverage limits, but do not make interaction/scenario coverage reconstructible. The previous effort reported 61/61 entry points while explicitly excluding complete execution in all hosts. This motivates better evidence, not an assertion that a new provider is already more effective.

TH already owns native workflow discovery, a shared upstream-tools reference and dependency policy, host setup routes, workspace selection and a snapshot-based PR review with finding verification. These are the integration surfaces. No relevant active change conflicts with this proposal at the initial base.

## Goals / Non-Goals

Keep one coordinator and one effort workspace. Use maintained engines and methods; keep TH's contribution to scope, preparation, context and synthesis. Preserve existing native permissions and reviewer independence. Do not introduce a scanner runner, new finding schema, generic quality score, database, install receipt protocol or copied upstream checklist.

## Decisions

### Coverage concerns relationships and scenarios

Audit consults the maintained [arc42 perspectives](https://arc42.org/overview/) and [SEI ATAM scenario approach](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/). These are references, not installable CLIs or a claim to perform a formal multi-day ATAM evaluation. A concise section in the existing audit report connects relevant areas and interactions to inspected evidence, findings, reasoned non-applicability and unverified limits. Inspection, inference and executed behavior remain distinct. Native specialist assignments include responsibility for cross-boundary questions. Counting files or mandatory fixed review phases was rejected because neither demonstrates depth.

### Select a small set of upstream capabilities

Semgrep CE scan supplies rule-based candidates to find-bugs and applicable PR reviews. Explicit project/rule selection and raw JSON or SARIF preserve scope, errors and skipped files; exit zero is not a clean bill. dependency-cruiser and Knip address dependency structure and unused-code questions in JS/TS using actual entry points, aliases and framework configuration. Other stacks reuse existing native/project checks. jscpd remains documented as an optional future duplicate-analysis option, not an installed dependency of this change.

Sentry find-bugs is an optional installed method for reviewing captured changes, not the implementation of whole-project find-bugs. Main selects it for an explicit request or a scoped contextual bug investigation and assigns it to the existing general reviewer within the same review. That reviewer executes the current installed method with the captured target and context; it does not rerun a second TH checklist. Once selected, missing installation follows shared preparation. Semgrep remains CE/local by default, without automatically opting into an account-backed CI upload. Provider methods and rules remain upstream. SonarQube, CodeScene and wshobson's full orchestration remain evaluated alternatives rather than additional installations.

### Extend shared preparation instead of implementing another installer

Extend `skills/pipeline/openspec-policy.json` with `quality_providers` declarations for owners, applicability, prerequisites, required capabilities and observed compatible baselines, separate from the mandatory OpenSpec/TEA/Superpowers spec stages. The shared guide remains `skills/spec/references/upstream-tools.md`. Its consumers and existing active-host setup/update routes select official lifecycle operations; setup can prepare the selected quality capability through this same route. There is no new installer. Missing selected tools are prepared on entering/resuming their consumer; healthy installations are reused. Preparation checks actual invocation and output configuration, and reports unresolved native activation honestly.

Use an existing project-managed CLI installation first. A tool-only installation uses the official package manager outside tracked product files; deliberately adding a maintained development dependency or project analysis configuration is a separate concrete product change within scope. Do not alter dependency manifests merely to hide task-local setup. Preparation may use official package managers, while analysis uses resolved executables. Existing hermetic quality-runner restrictions remain intact; this direct diagnostic integration does not require routing scans through that runner.

The installable providers are tools/skills, not arc42/ATAM. Their source/version and supported native entry are verified for Codex, Claude Code or OpenCode as applicable; provider metadata does not itself prove live activation. npm-based tools use the project resolution context even when the executable is task-local. Working reports go through documented destination options to the existing workspace; operational caches may use permitted temporary storage. No fresh parallel plan or mandatory restart is introduced.

Audit retains `research/00-audit.md`; find-bugs uses `research/00-find-bugs.md`. Raw diagnostic reports may live under `research/quality-tools/` in the same workspace, linked from the report. The pilot uses a bounded workspace testing directory for cases, scratch fixtures, measurements and results. Reusable product tests/configuration, if needed, retain their normal maintained paths.

### Reuse the immutable PR evidence path

Main prepares tools outside the frozen snapshot and analyzes a disposable copy derived from captured head/base identity. Existing review context, artifact paths, finding records, ledger and verifier remain authoritative. Main retains raw reports plus invocation/version/configuration, skipped/error scope and identity, then supplies evidence to the existing review at the appropriate stage without exposing peer conclusions during independent initial assessment. A selected upstream method cannot re-resolve a live default branch or overwrite the snapshot. Findings must establish PR causality and diff anchors before existing publication. No ad hoc SARIF importer or new automated verdict is needed; Main interprets the provider result using existing records.

Clarify `snapshot.md`'s existing dependency/execution wording to distinguish external-tool preparation from reviewed-project execution. Ordinary review-pr does not install project dependencies, execute project code or load executable PR configuration. Semgrep scans captured source with explicit declarative configuration. dependency-cruiser/Knip belong to applicable JS/TS audit work, not this PR scan. Main captures scanner output after snapshot preparation, retains it independently, and reconciles its candidates after the initial specialist returns before existing verification. This preserves the independent first assessment and the helper's artifact-integrity baseline; a selected Sentry method is that reviewer's method, not another peer report.

### Verify capability and benefit separately

Existing generation, package boundaries, reference resolution and snapshot/evidence tests establish distribution and executable invariants. Do not test prose by asserting phrases. A bounded retained pilot compares old/new diagnostic behavior on the same known historical inputs, supplementing TH's instruction contradictions with a small JS/TS fixture for dependency/unused-code tooling and a rule-matching fixture for Semgrep. Record supported detection, missed known cases, false positives, material coverage limits and preparation/run cost. Timings or tokens are measured only when observable, otherwise unknown. The pilot is evidence for selecting integrations, not a new production gate or proof that a static analyzer understands TH's prose.

## Risks / Trade-offs

- Static resolution misses dynamic consumers or mislabels generated copies → preserve entry-point/configuration evidence and investigate before removal advice.
- A broad report can still conceal shallow work → link scenario/interaction evidence and distinguish inspection from execution.
- Upstream skill instructions assume other authority or output paths → resolve the live scoped task and supported provider entry without patching upstream methods; disclose genuine incompatibility.
- A provider package runs installation/configuration code → use official routes under native permissions; no permission bypass or automatic hooks.
- Cross-host native execution may be unavailable locally → validate distributed entries and provider-supported paths, report the live-host limit rather than claim three executed sessions.

## Migration Plan

Integrate after the existing provisioning prerequisite. Add the new canonical skill, update shared references and native discovery, then regenerate packaged Codex/OpenCode copies. Keep installed external providers out of TH packaging. Existing audit and review invocations remain valid. Reverting the TH integration does not uninstall independently owned upstream tools or remove consumer reports. Complete implementation verification and archive the change with the eventual implementation PR; working pilot/reviewer output remains in the workspace.
