# External tools in the TH workflow

Read this shared integration reference when spec enters a provider stage, or
when another TH flow selects an upstream capability. Resolve the installed
provider before use; availability in one host does not prove activation in another.

TH coordinates the objective, workspace and delivery. OpenSpec, Superpowers and
TEA supply their own maintained methods. TH selects an installed capability,
passes the relevant context, follows its current instructions and uses its result.
The capability's algorithm, checklist, templates and scoring remain upstream.

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

| Tool / capability | When TH selects it | How it is applied and what it contributes |
| --- | --- | --- |
| OpenSpec author/apply | A bounded development objective needs written intent and tasks; or the user selects spec | Use the upstream workflow to maintain the existing proposal, requirements, design and tasks. This is the development intent shared with the other tools. |
| OpenSpec implementation verify | Every relevant OpenSpec change reaches completion, before its completed archive | Invoke the installed verify workflow with that change, implementation and test evidence. It examines implementation against intent. Main resolves actual defects before claiming completion. Structural validate remains a separate check. |
| Superpowers verification-before-completion | At the completion stage of spec; elsewhere when a concrete success claim needs supporting evidence or the user requests it | Load the installed skill with the intended claim, current candidate and available evidence. Follow its current instructions to obtain missing or outdated evidence. Use the existing project commands; do not create a TH verification engine. |
| TEA test-design | At the design stage of spec; elsewhere when behavior needs a testing strategy or the user requests it | Invoke the installed workflow with requirements, architecture and existing tests. Use its design to guide the existing implementation/testing work, without starting another development plan. |
| TEA test-review | After implementation and relevant test execution in spec; elsewhere when tests need quality review or the user requests it | Invoke the installed workflow over the relevant tests and results. Its report supplies that testing-quality lens; another TH agent does not repeat the same review merely because TEA produced it. |
| TEA trace | Before completing a spec change; elsewhere when requirement coverage needs explanation or the user requests it | Invoke the installed trace workflow with the current requirements and test evidence. Use its coverage analysis to find gaps and feed OpenSpec verify or acceptance review. |

Advancing through spec executes all the capabilities listed above at their
corresponding stages. They are part of that workflow, not merely suggestions in
its documentation. The user need not invoke each tool separately. This integrates
the named capabilities, not every workflow shipped by those projects.

A small documentation correction with no relevant OpenSpec change does not
automatically run these tools. An explicit request for a capability still applies.
Outside spec, contextual selection remains available. If a capability required by
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

1. During design, OpenSpec owns intent; execute TEA test-design to establish the
   testing approach.
2. During implementation, the implementer/tester uses that context and executes
   the project's tests. Execute TEA test-review to examine their quality.
3. Before completing the change, execute TEA trace to examine requirement coverage,
   then Superpowers verification-before-completion to substantiate completion claims.
4. For a completed OpenSpec change, execute upstream verify with the accumulated
   context and evidence, address actual defects and prepare its archive.
5. Continue the selected independent review and create-pr flow. Reviewers consume
   applicable evidence and focus on unresolved questions. Corrections renew
   affected verification; they do not automatically restart every tool.

Reaching design does not execute future completion stages. A planning-only request
stops at its authorized scope; it does not need implementation results that do not
yet exist. A resumed stage reuses its completed applicable assessment. New stages
consume that evidence and execute their own upstream method, rerunning project
commands only when required by the current candidate and upstream instructions.

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
