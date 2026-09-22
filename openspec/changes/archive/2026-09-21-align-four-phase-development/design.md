## Context

See proposal.md for motivation. The current spec skill folds upstream verification into its implementation step; validate references those providers but has no explicit CRAP route. Pipeline prose still uses Freeze/delivery headings, and CRAP usage documentation mixes current diagnostics with retired control-plane instructions. The calculator already exists and accepts normalized per-function complexity and coverage. There is no maintained project collector in this repository today.

Existing contracts already cover native authority, optional author review, shared workspace, provider ownership, archive and PR hygiene. This change connects those contracts rather than redefining their permission or review semantics. The Spanish working explanation and TEA design belong in the bound workspace; canonical intent belongs here.

## Goals / Non-Goals

**Goals:** One readable development path, explicit outputs and capability evidence, proportionate execution, useful recovery, and consistent native discovery across Codex, Claude Code and OpenCode. The plan and the coordinator's report should answer what ran and what remains.

**Non-Goals:** No state machine, new phase CLI, blanket quality suite, replacement permission harness, default-agent takeover, copied upstream methods, forced review pass, or universal language metrics adapter. Do not change legacy helper identity, invocation or receipt schemas just to describe current workflow use.

## Decisions

### 1. One shared phase reference, existing skills as entry points

Add `skills/spec/references/development-phases.md` as the shared method. It defines inputs, actions, outputs, completion evidence, tool selection and natural-language examples for the four phases. Keep provider installation/invocation specifics in `skills/spec/references/upstream-tools.md` and OpenSpec lifecycle/review specifics in their existing references. Consumers link rather than replicate these manuals.

Documentation budget: extended — one shared phase/tool guide replaces scattered handoffs; max 160 lines for the new phase reference. Relocate the existing quality-runner manual into a shipped spec reference and leave its former docs path as a pointer so every host can consume the same guide without a copied manual or new packaging engine.

Align `spec`, `pipeline`, `implement`, `validate`, `verify`, `create-pr` and `deliver`, plus `agents/ref-pipeline.md` and relevant general-agent discovery guidance. Replace current-use Freeze/gate headings with Validation/Publication; legacy helper checkpoint names may remain as technical arguments. Update existing navigation/docs, including OpenSpec integration and quality/CRAP guidance. Generate distributed copies using the existing tools; do not hand-edit runtime projections.

Alternative: four new skills or a router executable. Rejected because current entries already perform the work and another dispatch layer would add maintenance without additional capability.

### 2. The existing workspace plan makes the work observable

Extend `skills/spec/assets/plan.md` with a small phase view and capability evidence table. Columns: phase/capability, selection reason, scope or candidate, status, actual outcome/evidence and next action. Keep canonical tasks as the completion source; link rather than copy acceptance criteria. Use the same method in a pipeline plan without replacing an existing user plan.

Statuses are ordinary prose: pending, executed, not applicable, declined or deferred. An executed assessment can have findings or fail; an unavailable selected provider is pending. A no-code change can make CRAP inapplicable; an absent adapter cannot. Selected CRAP with no workspace manifest remains pending even if a historical helper calls its absent manifest not applicable; that technical result is not a completed selected assessment. Selected quality providers follow objective and stack. The coordinator reviews these entries at milestones and reports omissions explicitly. The table is not a schema checked by a new gate or an authorization record.

Alternative: a mandatory receipt per tool. Rejected: existing provider outputs already carry evidence, and extra records would duplicate authority and increase repository/workspace noise.

### 3. TEA spans design, implementation and validation

Preserve the current spec stages: execute installed test-design in Spec, test-review after tests, and trace before completion. Test-design informs selection of additional upstream ATDD/automate methods during Implementation, infrastructure setup only when needed by the objective, and NFR analysis during Validation. Prepare selected entries via official provider routes and pass the same intent, tests and workspace. Do not turn selection into a requirement to invoke every TEA workflow. Superpowers verification-before-completion and upstream OpenSpec implementation verify retain their distinct responsibilities.

The coordinator can delegate one TEA assessment to a suitable native specialist; consuming it completes that selected method without a duplicate generic testing review. Other reviewers investigate distinct questions. The final independent review selection follows the existing operator decision, including an explicit decline; it is not replaced by a TEA score.

### 4. Real CRAP uses existing diagnostics and upstream metric collectors

Validation explicitly considers CRAP for changed executable functions and selects measurement when useful to assess complexity against coverage. The existing runner consumes a workspace-local manifest and normalized report; it remains `measure` mode and runs only once inputs and its clean committed candidate preconditions are satisfied. Its checks for bounded input, candidate identity and output integrity remain tool contracts, not publication authority.

Document the supported invocation and preparation in the current-use section of `docs/quality-runner.md`; link it from Validation and replace stale mandatory-cleaner/lease guidance in `docs/cleaner-crap.md`. Reuse project collectors first. A missing selected collector gets a concrete official setup/adapter step or an explicit deferral, never a fabricated score. Keep temporary adapters, manifests and raw output in the workspace/tool cache. A reusable adapter may become product code only if that reuse is established and its tests justify the addition; a one-run demonstration is not such a reason.

For this integration's acceptance exercise, use a real Go source change in TH's installer history as an explicitly named measurement target, with an isolated clean checkout, its actual base/head, native Go test coverage, and the maintained upstream gocyclo collector. Record the source/version of the collector and normalize only unambiguously matched functions to the existing report contract. Use file and function identity, not package-wide averages; name unsupported/omitted functions. Add the measurement to the existing plan's Validation evidence with its exact receipt and exercise how publication preparation consumes or invalidates it. The pilot establishes that the documented path can measure real code and carry evidence through the flow; it does not claim this prose-only implementation has executable CRAP scope.

Sources inspected: [gocyclo](https://github.com/fzipp/gocyclo) documents its cyclomatic-complexity collector and official Go installation route; [Go cover](https://pkg.go.dev/cmd/cover) documents the native coverage tool. These collectors are selected for the bounded Go exercise, not mandatory dependencies for all consumers. Exact versions and candidate are resolved and retained when running it.

Alternative: only run existing CRAP fixture tests. Rejected as insufficient proof of project metric collection. Alternative: build a new multi-language analysis system. Rejected as contrary to the integration objective.

### 5. Reuse evidence without misbinding candidates

Phase transitions pass objective, workspace, tasks, selected tools, candidate, outstanding findings and authorized endpoint. These are existing task context, not a new handoff protocol. On correction, compare the affected source/configuration and renew the checks whose inputs changed. Preserve original reviewed revision, result and disposition; do not manufacture a new pass. An immutable runner receipt continues to identify its original candidate and is never relabeled as a new receipt. A subsequent documentation/archive-only change can consume still-applicable component evidence while disclosing that association and honoring any tool-specific binding rules.

Requests to start at Implementation, Validation or Publication recover earlier work and address concrete gaps within scope. They do not recreate an OpenSpec change solely to traverse the diagram. Planning-only requests stop after planning outputs; already authorized end-to-end work continues without repetitive approval questions.

### 6. Publication assembles existing lifecycle and hygiene contracts

Completed implementation receives test/provider verification, then living-spec synchronization and archive before the final review candidate. `verify` coordinates the selected local author review; `review-pr` remains for an existing PR. `create-pr` handles preparation and outward publication at the authorized endpoint. It checks artifact scope and evidence, including missing work and accepted risks. An unanswered review choice or incomplete accepted review retains its existing treatment; merely disclosing it does not make it complete or declined. Remote CI/reviewer state is reported as observed. Merge remains separately authorized. Local completion without a PR is also a valid endpoint.

Canonical task checkboxes cover implementation and its verification. Archive, final candidate review and outward delivery then follow the existing lifecycle and workspace plan. This avoids an incomplete archived checklist or falsely checking future publication work just to permit archive; it does not omit those delivery actions.

Current PR hygiene already separates product files from working output. Preserve it for consumers: reports, sketches that were only exploratory, logs, temporary adapters and provider installations stay out of commits; required durable examples/tests/configuration and canonical OpenSpec stay in their owning repo. Both local and Obsidian modes share this behavior.

## Verification approach

- Review the seven changed requirement blocks and their scenarios against the actual updated skill entry points and references, including the return from a correction. Do not create wording-presence tests for prose.
- Exercise planning-only, authorized end-to-end continuation, later-phase entry, unavailable selected provider, optional-tool non-selection, declined review, changed evidence and publication-only preparation. Retain scenario transcripts/outcomes in the workspace; never claim a host was exercised just because its generated files exist.
- Validate generated skill/reference availability for all three runtimes with existing synchronization/package checks. Use native runtime exercises where available and state unexecuted hosts explicitly; generated parity is a narrower claim than live invocation parity.
- Run the real Go CRAP pilot and distinguish its target and evidence from fixture-based runner regressions. Existing `tests/test_quality_runner.mjs` remains the calculator/contract suite; run it if the corresponding integration or helper surface changes.
- Run `tests/test_openspec_scope.py` and strict OpenSpec validation. Run existing generation, package, workspace and other behavior suites only for affected executable/distribution surfaces. Use the repository's tests policy; no tests solely asserting phase names or prose paragraphs.
- Complete TEA test-review/trace, Superpowers completion evidence, OpenSpec implementation verify and selected independent review at their actual implementation milestones. This planning turn runs test-design and planning checks, not those future stages.

## Risks / Trade-offs

- A longer checklist becomes another rigid harness → keep one readable plan view; tool selection follows intent and stack; explicit omissions and coordinator judgment remain visible.
- Conditional tools silently disappear → require a reason and actual state for selected capabilities; distinguish absent inputs from non-applicability.
- Metric collectors disagree about function identity or coverage → use matching source paths/symbols and candidate, expose partial scope, and avoid inferred zeroes or broad coverage averages.
- Native output paths leak temporary files into PRs → reuse workspace settings and verify actual destinations, including provider-derived paths.
- Four phases suggest full execution for every request → honor the requested endpoint and retain direct work/no-PR delivery.
- Old documentation overrides the current workflow → align only current consumer references; leave historical helper contracts clearly historical rather than silently deleting capabilities.

## Migration Plan

Ship ordinary skill/reference and generated-runtime updates through the existing release. Existing plans remain readable; add phase/evidence rows on resumption without moving workspaces or creating a new state record. No installer migration, runtime policy change or restart is required by this prose integration. Reverting the changed guidance/projections restores the old presentation; existing OpenSpec artifacts and workspace evidence remain usable.
