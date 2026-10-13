## Context

See [the proposal](proposal.md) for scope and [application-research](specs/application-research/spec.md) for behavior. TH distributes procedural skills from `skills/` into Codex and OpenCode through `sync-skills.mjs`; native Main already owns coordination. Existing research roles provide read/search advice. No new agent role is needed.

The inspected [REA revision](https://github.com/morluto/rea/tree/fd9588089d089e7cb02d12178e34407d6f889f22) and published `rea-agents` 6.4.0 are evidence baselines, not a compatibility guarantee for the later implementation. Its package exposes public CLI/MCP entry points, not a supported JavaScript import API. Its [workflow](https://github.com/morluto/rea/blob/fd9588089d089e7cb02d12178e34407d6f889f22/.agents/skills/reverse-engineer-anything/SKILL.md), [installation guide](https://github.com/morluto/rea/blob/fd9588089d089e7cb02d12178e34407d6f889f22/docs/installation.md) and [Evidence contracts](https://github.com/morluto/rea/blob/fd9588089d089e7cb02d12178e34407d6f889f22/docs/mcp-contracts.md) remain upstream.

## Goals / Non-Goals

**Goal:** Add a small TH workflow that passes context to REA, retains its standard results and interprets them for development decisions.

**Design boundaries:** No runtime wrapper, parser, schema translator, analyzer or new execution ledger is planned. Scope exclusions are in the proposal. The companion `improve-direct-diagnosis` change strengthens native audit/find-bugs analysis without consuming REA. Database models and frontend wireframes do not apply.

## Decisions

### 1. Consume the official workflow and public interfaces

`skills/research-app/SKILL.md` will collect the application/question/project context, reuse `workspace`, load the shared REA integration guidance and select the installed upstream workflow. Main invokes usable MCP tools or the supported CLI. Actual installed instructions and advertised schemas determine operations; TH will not enumerate REA tools or embed their algorithms.

This uses the maintained dependency without an internal SDK import or vendored skill. A custom subprocess adapter would create executable behavior and a second API contract without a demonstrated need, so it is deferred.

### 2. Prepare REA only when selected

Add one application-research section to `skills/spec/references/upstream-tools.md`. It will record official owner/package, active-host prerequisites, supported setup/update/readiness routes, output handling and known limits. The existing quality-provider preparation and ordinary spec dependencies remain unchanged. No new policy map is needed for a procedural dependency with no machine consumer.

Support explicit `rea` targets in canonical setup/update plus their authored Codex/OpenCode overrides: `skills/{setup,update}/SKILL.md`, `plugins/team-harness/skills/{setup,update}/SKILL.md` and `installer-assets/opencode-skills/{setup,update}/SKILL.md`. Those six bodies are not all generated. They should point to the shared section instead of duplicating instructions.

Use the current official package/setup route with the selected client only, matching workflow references and native permissions. Reuse a working CLI when MCP activation is unavailable. Record the resolved version/revision and distinguish package availability, skill discovery, session activation and selected-engine readiness. Never infer live activation from generated files or install every binary engine. Installation/update of REA is not TH installation/update.

### 3. Preserve Evidence and add a project interpretation

Keep original supported JSON/artifacts under `research/rea/` in the selected workspace; keep a concise interpretation in `research/00-research.md`. The directory is a TH output convention, not a new Evidence format. Retain supported provenance and diagnostics, and link derived views to their parent Evidence. Use upstream output flags/settings or save complete returned output; verify actual file destinations.

Before ending a session, export results needed later or retain complete inline files. Retained IDs are connection-local and are not reusable across separate CLI processes. Use supported summaries/views for large Evidence instead of flooding context or rerunning analysis. If export or retention is unavailable, disclose the limit and preserve the supported original representation.

The interpretation explains findings, uncertainty, user value, project fit, adaptations and acceptance examples. A chosen idea can be handed to `design`/`spec` with its evidence. A mandatory normalized TH schema would discard upstream semantics and add maintenance, so it is excluded.

### 4. Keep routing and runtime authority upstream/native

No technology selector or first-stack milestone is introduced. REA chooses applicable artifact analysis and follows its own complete-source research boundary. A supported target-free or metadata operation need not fail because an unrelated disassembler is missing.

Main or a bounded native executor owns application effects; read/search specialists retain their existing limits. Follow the installed provider's distinction between passive observation, active scenarios, application readiness, visible-result evidence and owned/external-session cleanup. These are execution context, not a separate TH control layer.

### 5. Distribute through existing generation

Add the canonical `research-app` catalog row in `skills/modes/SKILL.md` and concise discovery guidance in `README.md` and `skills/README.md`. Codex modes already discovers sibling skill metadata dynamically. Generate `plugins/team-harness/skills/research-app/{SKILL.md,canonical.md,agents/openai.yaml}` and `installer-assets/opencode-skills/research-app/{SKILL.md,canonical.md}` with `sync-skills.mjs`. No installer registry or role generator change is required unless concrete implementation evidence establishes otherwise.

Documentation budget: extended — one shared REA integration section must cover ownership, scoped lifecycle, readiness and portable results without copying upstream methods; max 60 added nonblank lines in `upstream-tools.md`. The new workflow is at most 80 lines; other discovery and authored route edits retain the normal per-document budget. Generated copies follow their canonical inputs.

REA-owned skill/configuration/engine files must remain outside TH canonical and packaged assets. Extend an existing packaging fixture only if a newly observed upstream installation layout exposes an actual ownership gap.

### 6. Validate the boundary with appropriate evidence

During implementation, reuse projection, metadata, packaging and installer suites. They can verify distributed machine artifacts and ownership; they cannot prove how a model follows prose. Do not add assertions for wording, tests that reimplement REA contracts, or a model benchmark.

Run a bounded controlled handoff with a selected representative application when REA is actually available. Exercise a usable public route, complete result retention and a project opportunity linked to Evidence; document capability mismatch, session-local IDs and missing-provider behavior where observable. Inspect the companion direct-mode improvements separately to confirm no REA path was introduced. An unexecuted scenario remains pending. Renew the existing TEA test-design for both changes; test-review, trace and OpenSpec implementation verify apply at their reached stages.

## Risks / Trade-offs

- **Release, installed workflow and live server differ:** resolve actual versions/schemas; use supported interfaces and record unavailable scope.
- **Large or session-local results lose portability:** retain original files/export bundles and use linked views before closing sessions.
- **A procedural skill's behavior exceeds hermetic coverage:** distinguish deterministic distribution checks, manual inspection and actual native integration evidence.
- **Shared preparation accidentally reaches diagnosis:** keep REA outside `quality_providers` and ordinary spec preparation; review entry/resume routes for `audit` and `find-bugs` unchanged.
- **A supported artifact needs unavailable software or another host:** preserve the scoped pending capability and recovery without narrowing the public mode or installing inactive hosts.

## Migration Plan

Implementation adds the canonical entry and routes, generates distributions and verifies existing installations preserve upstream assets. Before publication, synchronize the delivered requirements into living specs, apply the coordinated version/changelog update and run the required complete suite. Remove the completed change only after implementation verification and spec synchronization. Rollback removes the TH entry/routes through normal TH delivery and leaves independently installed REA assets owned by REA.

## Open Questions

- The controlled packaged-taskboard fixture demonstrated static CLI analysis and portable inline views. It does not select the operator's application or constrain supported technologies; runtime/MCP and other-host scenarios remain unexecuted.
- The resolved upstream setup plan keeps the REA skill in its independently owned native destination. No demonstrated packaging-ownership gap requires an additional fixture or installer exclusion.
