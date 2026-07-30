### Changed

- **MAJOR/breaking.** The two-agent pipeline coordinator (`th:leader` top-level session agent +
  `th:orchestrator` per-task subagent) is fused into one: the top-level agent IS `th:orchestrator`,
  dispatching every specialist directly and never dispatching another coordinator, including a copy
  of itself. `agents/orchestrator.md § Intake` / `§ Specify` / `§ Intent routing` absorb Intake,
  Discover framing, Specify, and the direct-mode specialist dispatch — the function the original
  two-agent framing omitted.
- Multi-project initiative mode is retained, but sequencing is now serial: `agents/ref-dispatch-machinery.md § "Multi-project sequencing"` runs one project at a time; reopening parallel dispatch requires changing the coordinator's own no-self-dispatch invariant in a plan, never a local exception.
- The Stage-1 plan-review panel (`qa-plan` ratification + `security` design-review conditional + `plan-reviewer` shape) now runs its full lens set exactly once per round on a Phase 1.6 `fail` — no selective, bucket-classified re-firing of a subset of lenses, no carried-forward sub-verdict labeling.
- A Stage-1 panel finding travels into implementation only by becoming an AC of its owning task, placed by the operator's `edit` reply, then validated by `qa` and required to carry a passing test by Phase 3.5. A contradiction between a finding and a ratified criterion is escalated to the operator as a choice, never implemented and verified after the fact.
- `00-state.md`'s narrative sections (`## TL;DR`, `## Hot Context`, `## Recovery Instructions`) are gone: the events file carries the narrative, and the `next_action` field carries the recovery instruction.
- `agents/ref-special-flows.md` becomes the sole home of every named pipeline flow; `docs/pipelines.md` is now a pointer-integrity-checked locator table over that file rather than a parallel human-facing catalogue.

### Removed

- **`agents/leader.md`, the secondary coordinator.** No successor file; its four functions are absorbed by `agents/orchestrator.md` (see Changed, above).
- **The coordinator spawn-payload contract.** No successor needed — Intake writes `00-state.md` directly.
- **`00-leader-roster.md` and its write discipline.** Successor: `00-state.md` discovery by identity-keyed glob; `/th:pipelines`' own pre-existing flat-table fallback.
- **Multi-Task fan-out and its consolidator.** Successor: two sessions on two worktrees, consolidated by the operator (measured pre-removal use: 0.6%, both instances operator-overridden).
- **Parallel multi-project dispatch (v2.61.0).** Successor: serial multi-project sequencing (see Changed, above).
- **The nested-dispatch takeover protocol** (`dispatch_handoff`, `blocked-no-dispatch`, the auto-takeover STOP phrase). No successor needed — no coordinator is ever dispatched as a subagent any more. `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "2"` provisioning is retained as harmless headroom for a specialist leaf agent invoked one level deep, not as a mechanism bound to the retired spawn.
- **Layer 1 of the gate-integrity model** — the audited relay plus the `leader-relayed-operator` provenance tag. **No successor for the auditability property; it is retired, not transferred.** A gate release is no longer separately auditable via a relay path (the property was prompt-level, never structural). What remains: `dev-guard`'s destination floor (wired); the nonce-freshness check and the atomic dual record (prose-enforced, since `gate-guard` is unregistered on both runtimes). Two surviving out-of-tree consumers of the retired property — the knowledge-graph `constraint` node and `docs/dev-mode.md § "Security Floor Non-Waivability (SEC-DR-3)"` — are reconciled separately (see the companion knowledge-graph supersession commit on this branch).
- **The boot capability check and its no-monolith-fallback STOP.** No successor. The check's subject genuinely disappears — there is no split to verify — and the silent-degradation defense it provided disappears with it, stated here as a cost rather than papered over.
- **The read-driven / mechanical distinction as a file-editing routing device.** Replaced by an unconditional read obligation per site plus an explicit R1–R5 treatment-rule annotation at every edit (`01-plan.md § "The treatment vocabulary"`), backed by three checks: the surviving-mention allowlist (`docs/coordinator-mention-allowlist.md`), the dangling-pointer guard (Suite 187), and `qa`'s own non-loss inventory re-derivation.
- **The two-owner arrangement on a single file or section.** No file in the resulting tree carries two mandates; enforced by the five tasks' disjoint `Files:` sets.
- **The Stage-1 correction-round apparatus** — the five-bucket correction classification, selective panel re-firing, carried-forward sub-verdicts, and the cross-round recurrence index. **Partial successor, stated by class:** diff-observable findings get both a carrier (an AC of the owning task) and a verifier (`qa` + Phase 3.5); contradiction findings escalate as an operator choice; the absence class (a remedy that is a criterion that does not exist) has no verifier beyond the operator's own recorded decision, plus SEC-002's fail-closed default on a sensitive plan.
- **Automatic knowledge-entity save at Phase 6, and the Phase 2.75 knowledge-capture window.** Successor: on-request `delivery` dispatch, plus the retained conditional security-finding write inside Phase 3, whose tool grant is now explicit rather than left to a `tools:` line that would otherwise silently no-op it.
- **`tests/test_leader_orchestrator_split.sh`.** Retired outright — invoked by neither `run-all.sh` nor the suite registry, so a green free-suite run was never evidence of its own reconciliation. Its still-valuable legs (gate-contract presence, dual-record tokens, the no-self-nesting prohibition) are retargeted onto `agents/orchestrator.md` itself.
- **`tests/test_gate_addressee_contract.py`.** Retired outright — the two-agent gate-rendering seam it asserted is gone; gate integrity is covered directly against the fused `agents/orchestrator.md` and `agents/_shared/gate-contract.md`.
- **`open_findings` as a live state field — NOT removed, kept with a schema and a named reader.** The reader is the Recover safety contract: on `/th:recover`, an entry with no matching `disposition` row in `00-decision-ledger.md` surfaces as an unresolved carry-over.
- **`checkpoint_advance_fresh` — NOT removed, retained.** Its attestation premise (a second coordinator confirming B1 and propagating that confirmation) retired with the fusion; the field itself stays live because `hooks/ts/bodies/checkpoint-guard.ts` still denies an opencode `th:architect` dispatch while `checkpoint_boundary: intake-plan` is armed. Rewriting that hook's advance contract is a deferred, separate follow-up.
- **`TH-LANE` injector — NOT removed in full, only the injector.** The parser is retained and fails open onto the same breadcrumb `subagent-trace` already produces; the injector had no subject left once intra-task lanes replaced project-keyed concurrent lanes.

Version bump: `3.0.0` across `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`'s
`plugins[0].version`, and `CLAUDE.md §3` (marketplace.json's own top-level schema version,
`1.1.0`, is untouched).
