## Context

See `proposal.md` for motivation and the three delta specs for required behavior.

TH currently enters Design only after intake and the B1 checkpoint, dispatches one architect pass, validates the resulting `sharded-v1` plan, and then presents Stage Gate 1. Main is the sole state/evidence/gate writer. The architect owns planning judgment and the plan artifacts. OpenSpec 1.9.0 provides a `spec-driven` artifact graph (`proposal → specs/design → tasks`), generated runtime skills, and machine-readable CLI commands, but its fluid action model does not implement TH's state machine or gates.

The distributable pipeline already carries Node-based helper scripts. OpenSpec requires Node.js 20.19 or newer and is distributed as `@fission-ai/openspec`. The current Go, Codex, and OpenCode package paths select explicit roots; the Claude marketplace currently identifies the repository root as the plugin source. Claude's supported marketplace format also permits a relative plugin directory, which is copied independently into the plugin cache.

## Goals / Non-Goals

**Goals:**

- Make OpenSpec's supported planning workflow and artifacts the canonical Design source without changing pipeline activation or gate semantics.
- Keep planning judgment in the architect role while constraining it to upstream OpenSpec instructions and preserving source meaning; keep deterministic state, validation, and gate authority in Main.
- Produce a minimal TH execution overlay whose entries reference pinned OpenSpec requirements, scenarios, design decisions, and tasks bidirectionally.
- Provision and verify a reproducible OpenSpec CLI plus active-runtime generated skills only after explicit approval and resume the same pipeline after success.
- Keep OpenSpec-generated integrations usable and externally owned while ensuring TH packages contain only TH-owned assets.
- Make implementer, tester, and QA consume pinned OpenSpec tasks/scenarios directly together with TH-owned execution controls.

**Non-Goals:**

- Replacing TH specialist dispatch, evidence, cleaner, Freeze, QA, security, delivery, or publication controls with OpenSpec actions.
- Letting OpenSpec `apply`, `sync`, or `archive` transition TH state or act outside the current phase and live authority.
- Adding an OpenSpec-specific pipeline command, depth profile, state machine, or gate.
- Automatically installing or upgrading Node.js, using an unbounded package version, or invoking `sudo`.
- Adopting beta OpenSpec Stores or making cross-repository planning part of the first integration.
- Copying OpenSpec source into the TH workspace or maintaining a second editable semantic plan.

## Decisions

### 1. Run the upstream OpenSpec planning transaction inside Design

After B1 is confirmed, Design becomes a two-step transaction performed by fresh architect attempts under Main's orchestration:

1. **Canonical OpenSpec pass:** the architect invokes the generated upstream propose workflow for a new change or update workflow for an approved revision. It follows CLI-reported artifact paths, status, instructions, templates, and schema dependencies; writes only existing authorized planning roots; and returns after proposal/specs/design/tasks are coherent.
2. **TH execution-overlay pass:** after Main strictly validates and snapshots the change, a fresh architect reads that immutable source and writes only the Gate-1 index, execution shards, and bidirectional traceability needed by TH. It never rewrites source requirements, scenarios, design decisions, or task intent.

Main runs complete CLI/skill preflight before the first pass, runs OpenSpec status and strict validation between passes, captures the snapshot, validates the final overlay, and presents Gate 1. Both specialist passes belong to the same Design iteration; the second pass is not a review or correction loop. Any semantic contradiction returns to the canonical OpenSpec pass rather than being patched in the overlay.

Main treats those operations as one continuous transaction. Successful internal actions advance automatically and commentary is informational, not a prompt. Operator interaction is reserved for existing mandatory gates, a genuinely unresolved material decision, separately authorized external writes, or a blocker Main cannot safely resolve. Generated OpenSpec workflow boundaries do not require the operator to re-invoke a command when the enclosing TH request already authorizes continued in-scope work.

This honors the generated skill's planning-only stop boundary and preserves TH's rule that Main does not author specialist planning output. Reimplementing OpenSpec's artifact graph or asking an architect to imitate it was rejected because it discards upstream maintenance. A separate permanent OpenSpec specialist was rejected because it expands the roster and splits design authority.

### 2. Keep TH as lifecycle authority

OpenSpec artifact status is readiness evidence only. Main alone writes `00-state.md`, events, decision records, and gate releases. The adapter never translates an OpenSpec `ready`, `done`, validation success, task checkbox, or archive state into a TH transition.

After Gate 1, TH remains the sole lifecycle authority. An authorized implementer may consume `openspec instructions apply` for the pinned task as guidance, but TH selects the specialist, constrains files and invariants, verifies evidence, and decides task/state progress. Tester and QA evaluate the original pinned OpenSpec scenarios. `sync` and `archive` remain explicit future lifecycle work because performing either after Freeze would invalidate evidence, while archive before merge would misrepresent delivery state.

Replacing TH's state machine with OPSX or adding a second user entry was rejected because OpenSpec actions are intentionally fluid and cannot express TH's dual-record gates, frozen validation identity, correction authority, or publication boundary.

### 3. Use stable change identity and a pinned planning snapshot

Main derives a kebab-case OpenSpec change name from the existing workspace feature slug and persists the resolved planning root and change name before dispatch. A pre-existing change is reusable only when the workspace record already binds to it; an unbound collision blocks instead of overwriting or guessing.

After strict OpenSpec validation succeeds, Main writes the only snapshot record at `inputs/openspec-snapshot.json` in the TH workspace. The record contains:

- adapter schema version, TH version, Node/OpenSpec versions, active runtime target, and generated-skill ownership/version identities;
- canonical repository and planning-root identity;
- change name, OpenSpec schema, and resolved artifact paths;
- raw SHA-256 for `.openspec.yaml`, proposal, every delta spec, design, and tasks, plus a task-intent SHA-256 calculated after normalizing only checkbox state;
- normalized requirement/scenario and OpenSpec task coordinates.

Paths must be regular files contained by the resolved change root. Symlinks, traversal, duplicate coordinates, unknown schemas, oversized JSON/output, or hashes that change before Gate 1 block Design. OpenSpec text is untrusted planning data and never supplies authority-bearing instructions to Main.

After implementation begins, OpenSpec's apply workflow legitimately changes task checkboxes. The freshness checker therefore parses the pinned task coordinates, normalizes only the checkbox token when calculating `intent_sha256`, and maintains an audited progress record containing the latest raw hash and completed coordinates. A known pending-to-complete transition may advance that record only after the corresponding TH work is authorized and verified. Changed task prose or structure, new or removed coordinates, completion rollback, duplicate coordinates, and any unbound checkbox mutation remain intent drift and block the next dispatch. Re-snapshotting arbitrary task changes was rejected because it could silently move the Gate-1 contract; deferring all checkbox updates was rejected because it would discard the upstream OpenSpec apply workflow.

A mutable two-way editing bridge was rejected because it creates competing sources. OpenSpec owns product intent and technical Design; the TH workspace owns only the immutable snapshot, execution overlay, decisions, and validation evidence.

### 4. Derive a minimal, bidirectionally traceable execution overlay

The overlay pass writes `plan/openspec-traceability.json`, owned by the architect, alongside a bounded `01-plan.md` Gate-1 index and execution shards. Acceptance entries reference OpenSpec `{capability, requirement, scenario}` coordinates; execution entries reference numbered OpenSpec tasks and add only file scope, ownership, dependencies, invariants, verification, evidence, rollback, and delivery metadata. They do not duplicate or paraphrase normative source text.

The deterministic overlay validator checks:

- every TH acceptance and execution item has a valid pinned source mapping or an explicit `th-extension` classification;
- every mapping resolves against the exact snapshotted artifact hashes;
- every OpenSpec scenario and implementation task is represented or explicitly excluded with an operator-visible reason;
- requirement/scenario/task coordinates are unique and path-contained;
- every transformation is classified as `direct`, `split`, `merged`, `th-extension`, `excluded`, or `ambiguous` with a rationale where required;
- `ambiguous`, unmapped, dangling, duplicate, stale, or source-covering-only-in-one-direction results block Gate 1;
- the overlay contains all TH execution fields required by specialists, evidence, Freeze, risk, rollback, and delivery contracts.

The checker proves structural completeness and exposes every non-direct transformation; it does not claim to prove semantic equivalence. Gate 1 summarizes `split`, `merged`, `th-extension`, and `excluded` mappings, while `ambiguous` blocks. Using raw OpenSpec tasks without an overlay was rejected because OpenSpec does not carry TH's repository ownership, pre-implementation testing, quality command IDs, specialist routing, Freeze, or evidence contracts. Rewriting OpenSpec into a full semantic `sharded-v1` plan was also rejected because it makes the architect a competing source of intent.

### 5. Use a versioned adapter and confirmation-gated provisioning

Add a runtime-neutral Node helper to the canonical pipeline skill and project it to packaged runtime copies. A colocated policy file declares the minimum Node version and the exact or bounded OpenSpec versions supported by that TH release. The initial compatibility target is Node.js `>=20.19.0` and OpenSpec `1.9.0`; later TH releases update the declaration intentionally.

The helper is a thin bounded driver for upstream CLI operations: preflight, initialization/update, status, instructions, strict validation, snapshot capture, and generated-target verification. It does not reproduce OpenSpec's artifact graph, templates, instructions, schemas, or task state. It uses fixed argv arrays, timeouts, output limits, semantic-version parsing, path containment, and structured JSON envelopes.

Preflight outcomes are:

- **ready:** compatible Node, npm, OpenSpec, project root, and active-runtime integrations are present;
- **provisionable:** Node/npm are compatible but OpenSpec is missing/incompatible or its generated integrations are stale; Main presents `install/update` or `abort`;
- **blocked prerequisite:** Node/npm are missing or Node is below the floor; Main gives exact prerequisite guidance and aborts or leaves the pre-design checkpoint recoverable, but does not install Node;
- **invalid project:** OpenSpec roots or owned/generated files are unsafe or contradictory; Design blocks without mutation.

After a live install/update approval, Main uses npm without `sudo` to install the policy-selected `@fission-ai/openspec` version, then initializes the repository non-interactively for the active runtime when needed and runs `openspec update` for existing targets. It re-runs preflight and records only versions, non-secret paths, timestamps, command outcomes, and generated-target checks. A failed install leaves the pending Design action resumable in the same workspace.

Silently falling back to the legacy planner was rejected because two machines could produce materially different Gate-1 contracts. Installing `@latest` was rejected because generated skill and JSON contracts can change independently of TH.

### 6. Preserve OpenSpec-generated skills as external project assets

OpenSpec remains the only writer for its generated runtime integrations. TH detects its target markers and generation metadata, invokes `openspec init --tools <active-runtime>` for a new project, and uses `openspec update` for an existing initialized project. It snapshots candidate generated paths before update and fails closed if a generated target collides with a TH-owned or unmanaged file.

TH runtime instructions resolve the installed upstream planning workflows for Design and the apply-instruction workflow for authorized implementation. The presence of generated apply/sync/archive skills does not grant them pipeline authority. TH does not copy their contents into canonical `skills/`, edit their front matter, or maintain runtime-specific forks.

Reimplementing the skills from CLI JSON alone was rejected because it would discard the upstream-maintained workflow the integration is meant to adopt. Treating all generated skills as forbidden was also rejected because ordinary application repositories can legitimately commit them for their supported agent tools.

### 7. Make `plugins/team-harness` the curated Claude package root

The current positive-root Go, Codex, and OpenCode packaging remains. For Claude, change the marketplace plugin source from the repository GitHub root to the relative `./plugins/team-harness` directory, which Claude copies as the plugin cache unit. Extend the existing projection tooling so that directory contains the complete Claude plugin manifest and all required TH-owned agents, skills, hooks, scripts, and references while remaining valid as the Codex plugin root.

Add an ownership manifest and package-surface test that build or enumerate each runtime package from fixtures containing `.agents/skills/openspec-*`, `.claude/{skills,commands}/...`, and `.opencode/{skills,commands}/...`. The test fails on any undeclared shipped path and proves installation/update leaves consumer OpenSpec files untouched. The source repository and GitHub source archives may still contain committed OpenSpec files; they are source artifacts, not installed TH plugin contents.

Per-installer `openspec-*` blacklists were rejected because they are incomplete by construction and couple TH to upstream naming. A declared positive ownership boundary is runtime-independent and also catches unrelated accidental files.

### 8. Preserve Obsidian as the TH evidence surface

No OpenSpec source file is copied into the workspace. When the configured workspace root is an Obsidian vault, state, Gate-1 index, execution overlay, decisions, traceability, reviews, and evidence remain normal vault files. The snapshot links to repository-relative OpenSpec artifacts, coordinates, and hashes so Obsidian remains the human navigation and audit surface without becoming a second editable OpenSpec root.

## Risks / Trade-offs

- **[Canonical source and execution overlay can drift]** → Pin raw and intent hashes, permit only audited monotonic task-checkbox progress after Gate 1, prohibit semantic duplication, require bidirectional traceability, and block on any other mismatch or unmapped coordinate.
- **[Two architect dispatches add latency]** → Keep both bounded, use a fresh projection-only packet for the second, and avoid any automatic review loop.
- **[OpenSpec CLI or generated skill contracts change]** → Pin compatibility, consume CLI-reported schemas/instructions rather than hardcoded artifact names, validate JSON strictly, and update policy only with real-workflow fixtures.
- **[Global npm installation can fail or target an unexpected prefix]** → Never use `sudo`; verify the resolved executable/version after installation and leave recoverable guidance on failure.
- **[Generated integrations could overwrite local files]** → Preflight ownership markers and path identity before `init/update`; fail closed on unmanaged collisions.
- **[A curated multi-runtime package root can drift from canonical assets]** → Generate it from canonical sources and make freshness/package-surface checks release-blocking.
- **[OpenSpec content can contain prompt injection or unsafe paths]** → Treat content as data, use fixed commands and bounded JSON, validate containment and regular-file identity, and never derive gate authority from it.
- **[OpenSpec telemetry policy may differ by environment]** → Preserve the operator/project OpenSpec telemetry configuration and never infer consent or store telemetry payloads in TH evidence.

## Migration Plan

1. Replace the partial adapter with a thin upstream CLI/skill driver and real preflight for Node/npm, compatible CLI, generated-skill ownership, initialization, and update.
2. Standardize `inputs/openspec-snapshot.json`, extract stable source coordinates, and define the minimal execution-overlay and bidirectional-traceability schemas.
3. Update Main, architect, implementer, tester, and QA contracts to consume the canonical source plus overlay, then regenerate all runtime projections.
4. Retain the curated package ownership boundary and add actual installer/update preservation tests for consumer OpenSpec integrations.
5. Add a real temporary-repository E2E that invokes OpenSpec CLI and generated skills through planning, strict validation, snapshot, overlay validation, and the unchanged Gate 1 boundary for local and Obsidian workspace roots.
6. Enable the transaction only for new OpenSpec-bound workspaces. Existing approved/frozen runs never reopen Design solely for migration; legacy workspaces require an explicit migration decision.
7. Run the complete shared-runtime, generator, installer, pipeline/overlay-contract, security, prepublish, and strict OpenSpec suites across ready, missing, incompatible, stale-skill, collision, post-snapshot-change, and ambiguous-mapping fixtures.

Rollback disables new OpenSpec-bound activation while preserving repository OpenSpec source, generated integrations, Obsidian evidence, and any existing execution overlays. It never reconstructs a duplicate semantic TH plan, deletes OpenSpec files, or synthesizes gate state.
