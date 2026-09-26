# External tools in the TH workflow

Read this shared integration reference when spec enters a provider stage, or
when another TH flow selects an upstream capability. Resolve the installed
provider before use; availability in one host does not prove activation in another.

TH coordinates the objective, workspace and delivery. OpenSpec, Superpowers and
TEA supply their own maintained methods. TH selects an installed capability,
passes the relevant context, follows its current instructions and uses its result.
The capability's algorithm, checklist, templates and scoring remain upstream.

Tools, agents and workflows contribute evidence and recommendations. Main and
the operator decide how to proceed: a finding, score or verdict does not invalidate
completed work, order a correction or create an automatic delivery block. Main
may accept, reject or defer a recommendation with its reason. Preserve original
results and disclose missing evidence; proceeding does not turn an unrun check
into a pass. Native permissions and the operator's scope still govern execution.

## Quality capability preparation

Quality providers are selected by the consuming objective, project stack, active host and
available project configuration. They are declared separately in the policy's
`quality_providers` map; their presence does not make them mandatory for every spec, pipeline or
review. At entry or resumption of `audit`, `find-bugs` or `review-pr`, Main checks the selected
provider's installed, discoverable and usable states and uses the existing native setup route to
install or repair only the selected capability when the task is authorized. A healthy provider is
reused. An unavailable selected provider leaves that analysis pending with a concrete recovery;
an unselected provider or inactive host is not installed merely because it appears in the catalog.

The current observed baselines are compatibility references, not TH-pinned releases. Recheck the
policy and the official owner before installation/update, record the resolved version or commit,
and verify the actual executable/skill and output configuration on the active host.

| Capability | Select it for | Official owner/lifecycle | Native entry on Codex, Claude Code and OpenCode | Evidence/output |
| --- | --- | --- | --- | --- |
| Semgrep CE `1.177.0` (observed 2026-09-21; Python `>=3.10`) | Concrete bug candidates in `find-bugs` and applicable captured PR source | [Semgrep](https://github.com/semgrep/semgrep); PyPI/Brew/uv/pipx routes in the policy; local CE by default | `semgrep` executable resolved in the selected environment | Explicit rule/config and captured scope; raw JSON or SARIF under `research/quality-tools/semgrep/`, with version, invocation, skipped files and errors |
| dependency-cruiser `18.4.0` (observed 2026-09-21; Node `^22 \|\| ^24 \|\| >=26`) | Dependency relationships and architecture questions in applicable JS/TS audits | [sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser); npm project or approved tool-cache route | `dependency-cruiser`/`depcruise` project executable | JSON/text/HTML report under `research/quality-tools/dependency-cruiser/`, with entry points, aliases/resolution and omissions |
| Knip `6.37.0` (observed 2026-09-21; Node `^20.19.0 \|\| >=22.12.0`) | Unused files, exports and dependencies in applicable JS/TS audits | [webpro-nl/knip](https://github.com/webpro-nl/knip); npm project or approved tool-cache route, including peer TypeScript dependencies when needed | `knip` project executable | JSON/text report under `research/quality-tools/knip/`, with entry points, framework config, external-consumer checks and errors |
| Sentry `find-bugs` (upstream `main`, resolved commit recorded per run) | Explicit request or scoped contextual bug investigation over a captured PR | [getsentry/skills](https://github.com/getsentry/skills); install/update through the official [Vercel Skills CLI](https://github.com/vercel-labs/skills), observed CLI baseline `1.7.0`, Node `>=22.20.0` | Native `find-bugs` skill selected for the active agent; no TH copy or rewritten checklist | Markdown assessment in the existing PR review artifact destination, linked from the finding ledger and verifier evidence, bound to captured base/head and scope |

arc42 and ATAM remain non-installable references. They guide architecture questions and scenario
coverage; they are not provider entries or command-line dependencies. dependency-cruiser and Knip
are audit-only in this change and are not selected for ordinary `review-pr`. Sentry `find-bugs`
is the existing general reviewer's optional upstream method, not a second TH reviewer. Provider
scores, exit codes or recommendations remain evidence for Main; they do not grant delivery
authority.

### Official routes and compatibility checks

For diagnostic audit/find-bugs, use a project-managed executable first when the selected project
already owns the tool. For ordinary `review-pr`, resolve an official host/tool-cache executable
outside the reviewed project and snapshot; never execute a project-provided binary, dependency
or executable configuration. Follow [captured PR evidence](../../review-pr/references/external-evidence.md)
for that route. A tool-only
installation may use the official package manager into the approved task/tool cache, outside the
repository and workspace evidence. Adding a development dependency or analysis configuration to a
project is a separate product change and requires that scope; do not modify manifests merely to
hide preparation. Verify the resolved command, version, prerequisites and output destination
before use.

- **Semgrep CE:** on macOS use `brew install semgrep`; on Windows/Linux use the official Python
  route `python3 -m pip install semgrep`, or an isolated `uv tool`/`pipx` installation. Update
  with the matching owner mechanism (`brew upgrade`, `uv tool upgrade`, `pipx upgrade` or pip
  upgrade). Local CE does not require login or upload; do not silently select account-backed
  rules or CI.
- **dependency-cruiser:** the owner documents `npm install --save-dev dependency-cruiser` for a
  project. If the task selects a tool-only install, use npm with an approved prefix/cache and
  resolve the resulting `dependency-cruiser`/`depcruise` executable. Check Node engine compatibility
  and the project's entry points, tsconfig/aliases and framework resolution before scanning.
- **Knip:** the owner documents `npm install -D knip typescript @types/node` for a project. A
  tool-only route uses npm with an approved prefix/cache and verifies the `knip` executable plus
  any project peer dependencies. Check entry points and framework configuration before treating
  unused output as a candidate.
- **Sentry `find-bugs`:** use `npx --yes skills@1.7.0 add getsentry/skills --skill find-bugs
  --agent <active-agent> --global --yes` for an authorized global/native installation, or the
  corresponding project scope when explicitly requested. Refresh only this selected upstream
  skill with the official targeted update command `npx --yes skills@1.7.0 update find-bugs
  --global --yes`; never run a bare all-skills update for this selection. Verify the source/ref and
  native discovery. Symlink is the CLI's preferred install mode where supported; use its documented
  copy fallback only when the native host cannot use symlinks. The provider remains outside TH
  packaging. Resolve by owner/source and objective before installation or update: `getsentry/skills`
  is the captured-branch method; TH's project/module diagnosis uses `/th:find-bugs` in Claude Code,
  `$team-harness:find-bugs` in Codex and `th-find-bugs` in OpenCode. Sentry retains the native
  `find-bugs` name. If a bare setup/update target remains ambiguous, ask which owner the operator
  intends before changing either installation. Verify the destination and active native entry;
  report any remaining collision without overwriting another owner's files.

Setup/update should report `installed`, `discoverable` and `usable` separately. A provider update
does not imply that an interactive session needs a restart: report active versus pending state and
request reload/reconnect only when the host documents that the changed entry cannot be activated in
the current session.

## Spec dependency preparation

At spec entry or resumption, reuse [workspace](../../workspace/SKILL.md), read the
[policy](../../pipeline/openspec-policy.json), and resolve OpenSpec, TEA and
Superpowers for the active host, including each provider's declared native skills
or command pointers for that host. TEA requires native skills for Claude/Codex and
command pointers for OpenCode; verify the selected entry kind without requiring
another host's integration.
Selecting spec includes preparing these declared dependencies within that task;
honor explicit read-only/no-install scope and native permission prompts. Ask only
when an operation needs authority beyond that preparation, not for each provider.
Reuse healthy installations without an automatic update or reinstall. If a
declared capability is missing or incomplete, and the task is authorized with
native permissions, use the existing [setup provider route](../../setup/SKILL.md)
and the provider's official owner to install or repair it. Preparation only makes
dependencies available; it does not run future stages or configure inactive hosts.

Pass the selected local or Obsidian workspace through supported provider settings,
and report installed, discoverable and active states separately. Check a resolved
version against the policy baseline and its prerequisites; validate compatibility
for another version instead of forcing a downgrade or pinning an unavailable
marketplace release. A failed action or pending activation gets a concrete recovery,
not a generic restart. Updating TH does not reinstall these providers.

TEA preparation uses BMAD's official module installer (`npx bmad-method install`),
which generates project-local native entries and uses `uv` for shared scripts.
Its optional CLI runners invoke a supported coding agent. Check each configured
report destination, including derived paths, against the selected workspace.
With BMAD 6.12 on Windows, use project-relative settings resolving to that same
absolute workspace. Inspect remembered configuration before install/update:
directory creation reads it before `--set` overrides and mishandles absolute
Windows paths. Correct only affected local path settings, then verify outputs.
Superpowers is installed as the official plugin for the active
host, then the required verification skill is selected from that installation.

## When each capability is used

Use [the four development phases](development-phases.md) for the shared journey
and the plan's selection/execution view. This reference owns provider invocation
and preparation details; TEA supplies testing architecture throughout the work.

In spec, Main invokes these methods with the existing intent and evidence. Select
the provider's supported sequential mode for bounded work; do not map each method
to a new agent. Preserve its current upstream instructions and useful outputs,
passing the selected workspace and reusing existing assessments. Test-design,
test-review and trace answer different questions about the same tests; they do
not each require another full analysis or test run. When additional expertise is
useful, give that reviewer the unanswered question and existing results.

| Tool / capability | When TH selects it | How it is applied and what it contributes |
| --- | --- | --- |
| OpenSpec author/apply | A bounded development objective needs written intent and tasks; or the user selects spec | Use the upstream workflow to maintain the existing proposal, requirements, design and tasks. This is the development intent shared with the other tools. |
| OpenSpec implementation verify | Every relevant OpenSpec change reaches completion, before its completed archive | Invoke the installed verify workflow with that change, implementation and test evidence. It examines implementation against intent. Main resolves actual defects before claiming completion. Structural validate remains a separate check. |
| Superpowers verification-before-completion | At the completion stage of spec; elsewhere when a concrete success claim needs supporting evidence or the user requests it | Load the installed skill with the intended claim, current candidate and available evidence. Follow its current instructions to obtain missing or outdated evidence. Use the existing project commands; do not create a TH verification engine. |
| TEA test-design | At the design stage of spec; elsewhere when behavior needs a testing strategy or the user requests it | Invoke the installed workflow with requirements, architecture and existing tests. Use its design to guide the existing implementation/testing work, without starting another development plan. |
| TEA ATDD / automate | During Implementation when test-design or the objective selects acceptance-first tests or expanded automation | Resolve and execute the installed upstream method with the current requirements, tests and workspace; preserve the existing OpenSpec task plan. |
| TEA framework / CI | During Implementation only when the objective includes missing test or CI infrastructure | Use the installed upstream setup workflow for that bounded infrastructure work. Existing sufficient infrastructure needs no reinstall or scaffold. |
| TEA NFR | During Validation when relevant non-functional requirements need assessment | Execute the installed method with actual implementation evidence; retain missing evidence and recommendations without treating thresholds as delivery authority. |
| TEA test-review | After implementation and relevant test execution in spec; elsewhere when tests need quality review or the user requests it | Invoke the installed workflow over the relevant tests and results. Its report supplies that testing-quality lens; another TH agent does not repeat the same review merely because TEA produced it. |
| TEA trace | Before completing a spec change; elsewhere when requirement coverage needs explanation or the user requests it | Invoke the installed trace workflow with the current requirements and test evidence. Use its coverage analysis to find gaps and feed OpenSpec verify or acceptance review. |
| Semgrep CE | When `find-bugs` needs rule-based candidates, or `review-pr` has selected a captured-source scan | Run the prepared local executable with explicit rules/configuration and scope. Retain raw JSON/SARIF, version, skipped/error scope and candidate identity; an empty result is not a clean bill. |
| dependency-cruiser | When `audit` asks about dependency relationships or architecture in an applicable JS/TS project | Run the project/tool-cache executable with actual entry points and resolution configuration. Investigate dynamic/external consumers and generated ownership before recommending removal. Do not select it for ordinary `review-pr`. |
| Knip | When `audit` asks about unused files, exports or dependencies in an applicable JS/TS project | Run the project/tool-cache executable with entry points/framework configuration and peer dependencies as needed. Treat output as candidates until contextual consumer checks complete. Do not select it for ordinary `review-pr`. |
| Sentry `find-bugs` | When Main explicitly selects an installed upstream change-review method for a captured PR or scoped contextual bug investigation | Assign the existing general reviewer the captured base/head and permitted evidence. Reuse its bounded assessment; do not run a second equivalent TH checklist or allow a live default-branch lookup. |

Advancing through spec executes OpenSpec's required stages and the declared
TEA/Superpowers capabilities at their corresponding stages. Quality providers are
optional: when a spec stage or consuming flow selects one by objective, stack and
active host, prepare and use that provider and retain its evidence; otherwise leave
it unselected. These integrations are part of the selected workflow, not a
requirement to install every quality provider. The user need not invoke each
selected upstream capability separately.

A small documentation correction with no relevant OpenSpec change does not
automatically run these tools. An explicit request for a capability still applies.
Outside spec, contextual selection remains available. If a declared capability required by
the current spec stage is unavailable, report it as pending and continue independent
authorized work. Do not declare that stage fully verified or silently replace the
provider with a TH imitation. An upstream assessment that establishes no applicable
tests or scenarios is reported with its reason, not mislabeled as a passing test
run. Missing mandatory OpenSpec verify prevents a completion claim for the change.

## How this fits spec, pipeline and direct work

Spec uses the sequence below. Pipeline and direct work reuse the same invocation,
workspace and evidence methods for their selected capabilities; invoking a tool
does not activate a second top-level workflow. OpenSpec verification remains
mandatory for relevant completed changes in any entry point.

1. **Spec:** OpenSpec owns intent; execute TEA test-design to establish the testing
   strategy and select later methods, commands and expected evidence.
2. **Implementation:** use that context, execute selected ATDD/automation or
   infrastructure methods, and produce maintained tests and focused test results.
3. **Validation:** execute TEA test-review and trace, selected NFR analysis,
   Superpowers verification-before-completion and upstream OpenSpec verify with
   applicable evidence. Address actual defects, prepare completed archive and
   perform the selected independent candidate review. Renew affected evidence
   after corrections; preserve original results and their dispositions.
4. **Publication:** create-pr consumes that evidence for artifact hygiene and
   the authorized preparation/publication endpoint. It does not rerun every
   provider or imply merge.

Reaching design does not execute future completion stages. A planning-only request
does not need implementation results that do not yet exist. If planning writes
repository artifacts, it still enters `create-pr` preparation while publication
honors an explicit operator stop or decline. A resumed stage reuses its completed
applicable assessment. New stages
consume that evidence and execute their own upstream method, rerunning project
commands only when required by the current candidate and upstream instructions.

Audit, find-bugs and review-pr use the same preparation and workspace contract when selected
outside the spec lane. Their entry/resume step selects only applicable quality capabilities, and
the active host's setup/update route performs any authorized official installation or repair. The
quality tools add evidence to the selected flow; they do not create a second top-level workflow or
replace the native general agent.

For example, a spec feature adding a third-party API uses test-design for failure
cases, test-review for its assertions, trace for requirement coverage, Superpowers
for completion evidence, and OpenSpec verify for correspondence with intent. The
tools share one effort and its evidence instead of reproducing each other's work.

## Invocation and shared context

Main or a bounded native specialist reads and executes the installed upstream
skill. The request carries the objective, relevant spec/tasks, code and test scope,
candidate identity, known findings and absolute local/Obsidian workspace path.
A delegated agent uses the provider as its method for that question; TH does not
run a second equivalent local method afterward.
Include the question, evidence boundary, supported output destinations and the
installed method's completion outputs in that assignment. Inspect the returned
artifacts before reporting completion; if a required output is missing, finish
that step or report it pending while reusing completed analysis. A prose report
alone does not complete a method that also requires native machine artifacts.

Keep source inspection, controlled examples, executed tests and live-host evidence
distinct. Apply the installed provider's coverage semantics, not a desired passing
score: mappings to scenarios are not executed tests. Missing scope,
counts, snapshot identity or time remain unknown in the provider's supported form.
Record actual run time when available; never substitute midnight or a base commit
for an unobserved timestamp or dirty candidate. Preserve original assessments and
append corrections and Main's disposition instead of silently rewriting a verdict.
These are evidence handoffs, not TH copies of upstream schemas or scoring logic.

Use the runtime's installed entry. OpenSpec's researched entries are Claude
`/opsx:verify`, Codex `$openspec-verify-change`, and OpenCode `/opsx-verify`;
they are agent workflows, not a shell command named `openspec verify`.
Superpowers uses its native plugin skills. TEA uses BMAD-generated native skills
or pointers; a supported upstream CLI runner may be used when headless execution
helps. Resolve actual entries from the installed version.

Before entering a provider stage, resolve its current installed skill and version
from the host's native discovery or an explicitly bound official installation.
Read that source afresh; a newer cache directory alone does not select it.
An official package may expose a skill root for direct native-agent execution:
read and follow its upstream entry and referenced steps with the actual project
root. Loading those instructions does not prove plugin activation or a CLI run.
Pass the stage and existing authorization so upstream menus do not ask again for
a decision already supplied. Follow upstream config/customization precedence.

OpenSpec's tested baseline and required workflow list are in
`../../pipeline/openspec-policy.json`. Check the actual CLI version, Node/npm and
generated host entry before depending on them. If verify is omitted by the current
profile, use upstream `openspec config profile` to retain existing choices and add
the missing workflows, then `openspec update`. For a new target use
`openspec init --tools <target>` with its selected profile. Preserve other host
targets and workflow selections; do not replace a global profile wholesale.
The CLI package update and generated-instruction refresh are separate operations.
Reuse authority already covering the dependency operation and native permissions.

TEA's observed native names are `bmad-testarch-test-design`,
`bmad-testarch-test-review` and `bmad-testarch-trace`. The official BMAD installer
generates skills for Claude/Codex and command pointers for OpenCode. TEA 1.27.2
declares Node >=22.20.0; this provider prerequisite does not change TH's own floor.
For additional selected work, resolve the installed `bmad-testarch-atdd`,
`bmad-testarch-automate`, `bmad-testarch-framework`, `bmad-testarch-ci` or
`bmad-testarch-nfr` entry as applicable. Prepare only selected missing entries
through the official route; reading the catalog does not select them all.
Use native skill execution for interactive work. The optional runner's
`--agent none` only resolves inputs and emits a prompt; it is not a completed
test review. Check the installed runner's help before selecting its adapter.
Verify the runner actually consumed the supplied context. If it omits workspace
inputs or restricts them to the project root, use native execution of the installed
skill with those paths; do not mirror an Obsidian workspace into the repository.

Pass output locations through supported provider configuration or flags. Resolve
the existing workspace once and give every provider the same resolved destination:
the configured local workspace in local mode, or the existing effort folder in
the configured vault in Obsidian mode. Obsidian mode creates no local mirror.

Working test designs, coverage analyses, verification reports and review summaries
are retained there as Markdown, with links from the existing plan. If a provider
returns its assessment only in conversation, Main records a concise faithful
summary with the source and outcome there. Do not generate empty reports merely
to populate a fixed folder tree. Required JSON, captures and other native artifacts
keep their formats; transient caches or isolated runs may remain in permitted
temporary storage, linked when useful.

Canonical OpenSpec proposals, tasks, deltas and archives stay under openspec/ in
their owning repository. Product code, maintained tests and durable documentation
stay in their normal repository locations. Provider installation metadata stays
at the location managed by its installer. Workspace notes link to these sources
without duplicating them.

Reuse current evidence when the upstream workflow accepts it and rerun checks
when the candidate or evidence requires it. Verify actual provider output paths.
If a required capability cannot honor the selected workspace through a supported
route, report the integration limitation and pending action; do not silently switch
modes, create a second workspace or claim the output was retained there.

Main interprets findings with the whole task context, documents material
dispositions and continues authorized work. Provider recommendations and scores
do not grant or revoke delivery authority. Native host permissions govern actions.

## Verification after archive

Verify the active change before archive. A path-only relocation reuses applicable
implementation evidence after links and structural validation are refreshed.
An intent change uses a bounded new amendment; retain the original history.

For a code-only correction, OpenSpec 1.9 supports active context but has no
archive/reopen implementation-verification command. Use a disposable native
checkout of the corrected committed candidate. Place an exact copy of the
archived change's own artifacts under an unused active change name there, and
run upstream status/instructions and the installed verify workflow in that
checkout. These are temporary task artifacts, not copied upstream instructions.
Record the candidate commit, original archive paths and content identity with
the report in the real workspace. Confirm that implementation and input artifacts
still match those sources before reusing the result.

Do not archive this temporary context, apply its deltas again, publish it or
change the original archive location. Missing artifacts or a context that the
installed upstream version cannot consume leave verification pending with the
specific recovery needed. This is temporary context preparation using existing
tools, not an upstream reopen API or a second durable spec.

## Installation, updates and documentation ownership

| Tool | Upstream owner and lifecycle | Integration details maintained by TH |
| --- | --- | --- |
| OpenSpec | [OpenSpec](https://github.com/Fission-AI/OpenSpec); official package-manager install/update, then upstream profile/init/update for generated workflows | Tested compatibility policy, required verify availability and where the workflow enters TH completion |
| Superpowers | [Superpowers](https://github.com/obra/superpowers); official plugin installation and host-managed updates | Selected completion capability, native discovery and relevant host/bootstrap limitations |
| TEA | [BMAD TEA](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise); BMAD module install/update and optional official runner distribution | Selected testing capabilities, workspace destinations and supported native entries |

This is the single TH reference for tool purpose, selection, context, results and
integration boundaries. Consumer skills link to the relevant section. Setup/update
documentation may describe host-specific steps but links to upstream installation
instructions instead of maintaining a parallel copy of provider manuals.

Authorized updates use the installation owner's mechanism, verify the resolved
version and refresh the next invocation's instructions. Updating TH does not
implicitly reinstall every provider. Installation and session activation are
reported separately; no restart is requested solely because an update occurred.

Research found relevant limits that must be checked for the installed versions:
Superpowers has bootstrap behavior in some hosts, and its OpenCode installation
guide specifies a restart; TEA's documented test-review runner has no dedicated
OpenCode adapter, so use BMAD's generated native entry there. No skills-only
installer, custom adapter or hot-reload guarantee is implied. The implementation
must establish exact compatibility before claiming support.

The maintained TH integration includes selection, context transfer, native
invocation and consumption of evidence. Provider skills, verification algorithms,
test frameworks, scoring, templates, hooks and update engines remain external.
