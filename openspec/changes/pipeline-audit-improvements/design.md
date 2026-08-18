# Design — pipeline-audit-improvements

Evidence base: pipeline audit 2026-08-17 (operator vault workspace `2026-08-17_th-pipeline-audit/`, docs 00–74), an independent Codex-runtime review of the proposals, and empirical sandbox probes on the operator machine.

## D1. The release decision originates at Gate 1

The gate contract requires every release to be a recorded human decision (dual record, fresh nonce). Auto-ship does not weaken this: the ship decision moves INTO the operator's Gate-1 reply. The Gate-1 presentation discloses the active release policy; the recorded dual record carries `release_policy: auto-ship`; Gate 3's mechanical execution cites that record. No nonce is reused and no release is machine-originated — the machine executes a human decision recorded earlier.

- `gate1_release` accepts a single value `approved`; `approved-autonomous` remains legible for recovery of historical state but is never re-emitted.
- Pauses come only from the closed exception list (three classes: design-changed, security, infrastructure). The list always wins over auto-ship; auto-ship fires only on total green.
- Recovery treats `{ship, auto-ship}` as cleared release values and never executes an auto-release itself.

## D2. Quality: one run per candidate tree, and B-39/B-40 fall together

`runQualityChecks` is already checkpoint-agnostic; a single `freeze` invocation with the union of declared commands + required checks subsumes cleaner POST, post_implementation, and Freeze build-lint. Two couplings make the collapse safe only as a unit:

- The CRAP-enforce baseline is produced solely by the cleaner PRE transition — retiring cleaner transitions while keeping CRAP enforce guarantees a permanent block. Both retire together; CRAP stays measure-only (`not_applied`).
- The cleaner-overreach allowlist proof (the one pre/post check with real detection value) survives as a Freeze postcondition, not as a separate checkpoint.
- The per-task red→green test contract (`test-transition.mjs`) is orthogonal and survives unchanged.
- Sequencing: runner diagnostics (`quality-runner-diagnostics`) land BEFORE the collapse, so the single Freeze run can distinguish a candidate defect from a runtime restriction.
- "One run" means one run per `candidate_tree`; a correction that changes the tree requires a fresh run.

## D3. Coverage honesty is the review floor

An absent lens, oracle, or coordinate never yields a clean pass. The QA lens reports `acs_evaluated` and `lens_status: full|limited|absent`; the consolidator receives the frozen worktree coordinate, keeps a discard/demotion ledger reconciled by the coordinator, and the published body names which lenses ran. The reviewer contract sequences code analysis before conversation reading (thread only for dedup after the draft verdict) and the dispatch payload stays coordinate-only. Publish integrity: the body's verdict line always matches the chosen event, and the approved draft is hash-anchored between preview and publish.

## D4. Codex parity: declared capability must equal effective capability

Codex subagents have no standalone Read/Glob/Grep; bounded read-only `exec_command` is the sanctioned transport. The capability registry, the generated TOMLs, and the instruction adapters must agree — validation of metadata that no runtime enforces is not validation. Sandbox diagnosis distinguishes "project config shadows global writable_roots" (fix: update tree / regenerate config) from "session born before the sandbox change" (fix: restart); today both surface as restart advice and one of them loops forever. Review worktrees move from predictable `/tmp` paths into the git-ignored `workspaces/` tree.

## D5. Workspace: repository-local canonical, one-way Obsidian export

During a pipeline run, all coordination state lives under `{repo}/workspaces/{feature}` regardless of runtime. After draft-PR creation or terminal close, an atomic one-way export copies to the configured vault. The vault copy is a non-authoritative view: never used for recovery, never synced back; a failed export marks `obsidian_sync: pending` without blocking. Rationale: sandbox write policy is captured at session birth (external roots are fragile), and vault metadata latency (~8 s per recursive scan on 9p) taxes every multi-file operation. `obsidian-direct` remains an advanced opt-in behind the existing write probe.

## D6. Agent authoring: two artifacts, one standard

Every role has a semantic contract (`agents/*.md`) and, per runtime, a compact adapter. The standard governs both: canonical skeleton (role → when-invoked steps → criteria → output template → boundaries), size budgets (specialist ≤ 2,000 words, shared contract ≤ 1,500, references one level deep with TOC), and ten authoring rules (deletion test, one motivated rule over enumerations, one term per concept, no time-sensitive statements, scarce emphasis). Lint enforces structure deterministically: budget warnings, description format, dangling section anchors, reference depth. Parity checks detect rules present in the semantic source but absent or contradicted in a projection. Staged rewrites target the oversized files by per-dispatch cost (`architect.md` first at ~9× budget); `ref-pipeline.md` shrinks through this change's own phases, not a separate rewrite.

## D7. What does not change

`policy-block`/`dev-guard`/`gcp-guard` floors; `base_sha` + Freeze anchoring; the security-review floor and adversary dispatch; the red→green contract; human merge authority; the OpenSpec design integration (#602). No new guards, no new gates, no new approval currencies.

## D8. Editing mandate

Every task that touches prose rewrites the affected section as a whole — coherent order for the full text, one concern in one site, no appended patch paragraphs, net word count equal or lower per touched file (additions must be paid for by consolidation). Deterministic suites that anchor on current literals are migrated in the same task that changes the literal.
