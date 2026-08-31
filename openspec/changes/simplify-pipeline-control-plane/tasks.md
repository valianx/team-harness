## 1. Build the control-plane core

- [x] 1.1 Implement closed `capability_lease` and `result_envelope` validation plus atomic canonical control-log append/replay, with focused regressions for malformed records, forged provenance, interruption, bounds, paths, and secrets.
  - **TC-1:** Closed schema parsing MUST canonicalize before hashing and reject unknown fields, unsafe paths, symlink escapes, oversized values, secret-shaped content, invalid lifecycles, and identity mismatches.
  - **TC-2:** Append/replay MUST enforce contiguous sequence and previous-hash identity, commit atomically, and preserve the last valid prefix on interruption or corruption.
- [x] 1.2 Make the control log the sole authority source and rebuild state, Gate, finding, and acceptance views as Main-owned idempotent projections without a second release or transition currency.
  - **TC-3:** Gate nonce consumption and accepted result identities MUST be idempotent control events; projected fields MUST NOT independently authorize or revoke work.
  - **TC-4:** Main MUST be the only control-log appender and projection writer, and recovery MUST rebuild drift without re-presenting a valid Gate.

## 2. Switch specialist dispatch, results, and recovery

- [x] 2.1 Carry one capability lease in the existing immutable work capsule, enforce exclusive committing ownership per canonical worktree, and remove competing prompt-level authority, scope, artifact, and cursor copies.
  - **TC-5:** Lease issue, continuation, revocation, transfer, and close MUST revalidate authority, worktree, mutable paths, immutable inputs, context identity, and exclusive ownership.
  - **TC-6:** Capsule certification MUST bind pinned sources and seams once per uninterrupted transaction and reject duplicate normative prompt copies or out-of-scope writes.
- [x] 2.2 Make every pipeline specialist return one role-appropriate result envelope, validate and accept it once in Main, and project commits, findings, evidence, and prerequisites only after the accepted-result event commits.
  - **TC-7:** Result acceptance MUST bind the active lease, immutable inputs, observed log sequence, changed/evidence paths, and terminal identity; duplicate results MUST be idempotent.
  - **TC-8:** Finding and closure fields MUST use closed structured vocabularies with bounded diagnostics, and specialists MUST NOT write coordinator projections or choose phases, Gates, or peers.
- [x] 2.3 Reuse a valid lease and specialist session for same-agent continuation, reduce liveness to bounded facts, and route continuation, replacement, or pause only from changed causal evidence and retained safety floors.
  - **TC-9:** Probe, attempt, correction, elapsed-time, token, and tool-call counts MUST remain telemetry and MUST NOT select recovery action or terminal status.
  - **TC-10:** Recovery MUST preserve safe progress, prove mutable ownership, rotate on identity/context/independent-lens changes, refresh QA for every changed Freeze, and refresh security when impact is true or unknown.

## 3. Make conditional work demand-driven

- [x] 3.1 Validate pipeline core and architect at activation, validate every later role immediately before first dispatch, and persist the selected model/effort as reusable non-authoritative execution metadata.
  - **TC-11:** Deferred preflight MUST use the existing canonical registry and generated-role freshness checks and MUST preserve prior authority, workspace, and evidence on failure.
  - **TC-12:** Model/effort metadata MUST carry no Gate, scope, or outward authority, MUST exclude secrets, and MUST be requested again only when the persisted profile is unavailable.
- [x] 3.2 Separate prerequisites and per-task RED from final quality, skip cleaner when deterministic hygiene has no safe production allowlist, and execute the complete quality set once per candidate tree at Freeze.
  - **TC-13:** Cleaner eligibility MUST be deterministic and behavior-preserving; an empty allowlist is an evidenced no-op and any semantic or out-of-allowlist proposal returns to its owning role.
  - **TC-14:** Complete quality MUST bind one candidate identity and rerun only after that identity changes; pre-implementation checks MUST NOT emit or imply a final quality verdict.

## 4. Convert once and cut over

- [x] 4.1 Implement and test create-then-switch v1-v4 to v5 conversion, preserving precise binding diagnostics and verified legacy continuation authority, then make current dispatch/recovery reject legacy writable fields and imports.
  - **TC-15:** Conversion MUST validate historical authority, bindings, immutable inputs, dirty progress, original Gate, continuation identity, repair evidence, and service diagnostics without inferring a missing decision.
  - **TC-16:** The switch pointer MUST commit last, mixed writable schemas MUST fail closed, and rollback MUST read but never overwrite an existing valid v5 workspace with v4 state.

## 5. Preserve every runtime and verify the reduction

- [x] 5.1 Remove retired current-path routes, regenerate packaged helpers, agent copies, Codex TOMLs, and opencode assets from canonical sources, update migration/testing/contributor documentation, and record focused, full, behavioral, security, strict OpenSpec, generated-freshness, diff, and before/after friction evidence.
  - **TC-17:** Generated and packaged projections MUST preserve the v5 schemas, authority, ownership, result, causal-recovery, staged-preflight, and Freeze semantics byte-for-byte where shared and substantively where runtime adapters differ.
  - **TC-18:** Current semantic and generated surfaces MUST contain no executable `TH-LIVENESS-RESUME`, `single retry`, `max-3`, `N/3`, retry-exhausted, one-replacement, or ambiguous correction-round route; historical fixtures and migration documentation MUST be explicitly classified as legacy.

## Team Harness Execution Contract

```json
{
  "schema_version": 1,
  "kind": "team_harness_openspec_execution_contract",
  "worktree": {
    "path": "/home/valian/projects/team-harness/.worktrees/simplify-pipeline-control-plane",
    "branch": "feat/simplify-pipeline-control-plane",
    "base_sha": "85c3eef6ae3fdcb50db737d2b971feb677d6b802"
  },
  "quality_manifest": {
    "schema_version": 1,
    "commands": {
      "test": {
        "argv": ["node", "tests/test_pipeline_control_plane.mjs"]
      },
      "full_suite": {
        "argv": ["bash", "tests/run-all.sh"]
      },
      "behavioral": {
        "argv": ["bash", "tests/run-behavioral.sh"]
      },
      "codex_generate_check": {
        "argv": ["node", "tools/codex-runtime/generate.mjs", "--check"]
      },
      "codex_generate_test": {
        "argv": ["node", "tools/codex-runtime/test_generate.mjs"]
      },
      "diff_check": {
        "argv": ["git", "diff", "--check"]
      }
    },
    "test_contract": {
      "path_rules": [
        {"type": "prefix", "value": "tests/"}
      ]
    }
  },
  "tasks": [
    {
      "source_id": "task:1.1",
      "owner": "pipeline-runtime",
      "specialist": "implementer",
      "files": [
        "skills/pipeline/scripts/control-plane.mjs",
        "skills/pipeline/scripts/helper-bundle.mjs",
        "tests/test_pipeline_control_plane.mjs",
        "tests/test_pipeline_helper_entrypoints.mjs"
      ],
      "dependencies": [],
      "required_invariants": ["I-1", "I-3", "I-5", "I-9"],
      "technical_constraints": [
        "TC-1: Closed schema parsing MUST canonicalize before hashing and reject unknown fields, unsafe paths, symlink escapes, oversized values, secret-shaped content, invalid lifecycles, and identity mismatches.",
        "TC-2: Append/replay MUST enforce contiguous sequence and previous-hash identity, commit atomically, and preserve the last valid prefix on interruption or corruption."
      ],
      "quality_command_ids": ["test", "full_suite", "diff_check"],
      "observable_runtime_behavior": true,
      "pre_implementation_test": "required",
      "required_evidence_anchors": ["02-implementation.md", "03-testing.md", "reviews/04-validation.md", "reviews/04-adversary.md"],
      "cross_runtime_preservation": "Claude, Codex, opencode, and installed plugin helpers validate identical primitive fields, hashes, bounds, errors, and replay outcomes.",
      "rollback": "Revert the new helper, registry entry, and focused tests before any v5 switch; retained v4 state remains authoritative.",
      "delivery_group": "default",
      "discovery_scope": {
        "directories": ["skills/pipeline/scripts", "tests"],
        "globs": ["skills/pipeline/scripts/*.mjs", "tests/test_*control*.mjs", "tests/test_pipeline_helper_*.mjs"]
      },
      "required_seams": [
        {"path": "skills/pipeline/scripts/control-plane.mjs", "anchor": "capability lease, result envelope, and control-log validation/append/replay exports"},
        {"path": "skills/pipeline/scripts/helper-bundle.mjs", "anchor": "canonical packaged-helper registry"}
      ]
    },
    {
      "source_id": "task:1.2",
      "owner": "pipeline-coordinator",
      "specialist": "implementer",
      "files": [
        "agents/_shared/orchestrator-state.md",
        "agents/_shared/gate-contract.md",
        "agents/_shared/coordinator-recovery.md",
        "agents/orchestrator.md",
        "agents/ref-pipeline.md",
        "skills/pipeline/SKILL.md",
        "plugins/team-harness/skills/pipeline/SKILL.md",
        "plugins/team-harness/skills/pipeline/references/state-and-gates.md",
        "plugins/team-harness/skills/pipeline/references/recovery.md",
        "tests/test_pipeline_control_plane.mjs",
        "tests/test_resume_session_workspace.mjs",
        "tests/test_flow_event_schema_sync.py",
        "tests/test_openspec_events.mjs"
      ],
      "dependencies": ["task:1.1"],
      "required_invariants": ["I-1", "I-5", "I-9"],
      "technical_constraints": [
        "TC-3: Gate nonce consumption and accepted result identities MUST be idempotent control events; projected fields MUST NOT independently authorize or revoke work.",
        "TC-4: Main MUST be the only control-log appender and projection writer, and recovery MUST rebuild drift without re-presenting a valid Gate."
      ],
      "quality_command_ids": ["test", "full_suite", "diff_check"],
      "observable_runtime_behavior": true,
      "pre_implementation_test": "required",
      "required_evidence_anchors": ["02-implementation.md", "03-testing.md", "reviews/04-validation.md", "reviews/04-adversary.md"],
      "cross_runtime_preservation": "Every runtime derives Gate, state, finding, and acceptance views from the same accepted control events while Main remains the only writer.",
      "rollback": "Restore v4 projection readers before cutover while leaving any experimental control log read-only and preserving existing Gate evidence.",
      "delivery_group": "default",
      "discovery_scope": {
        "directories": ["agents", "agents/_shared", "skills/pipeline", "plugins/team-harness/skills/pipeline", "plugins/team-harness/skills/pipeline/references", "tests"],
        "globs": ["agents/*orchestrator*.md", "agents/ref-pipeline*.md", "agents/_shared/*state*.md", "agents/_shared/*gate*.md", "agents/_shared/*recovery*.md", "skills/pipeline/*SKILL.md", "plugins/team-harness/skills/pipeline/*SKILL.md", "plugins/team-harness/skills/pipeline/references/*state*.md", "plugins/team-harness/skills/pipeline/references/*recovery*.md", "tests/test_*state*.mjs", "tests/test_*event*.mjs"]
      },
      "required_seams": [
        {"path": "skills/pipeline/scripts/control-plane.mjs", "anchor": "projection and accepted-control-event exports from task:1.1"},
        {"path": "agents/_shared/orchestrator-state.md", "anchor": "canonical coordinator state and projection contract"},
        {"path": "agents/_shared/gate-contract.md", "anchor": "Gate authority and nonce contract"},
        {"path": "plugins/team-harness/skills/pipeline/references/state-and-gates.md", "anchor": "Codex pipeline state and Gate callsite"}
      ]
    },
    {
      "source_id": "task:2.1",
      "owner": "specialist-dispatch",
      "specialist": "implementer",
      "files": [
        "agents/_shared/dispatch-contract.md",
        "agents/_shared/implementation-assembly.md",
        "agents/_shared/operational-rules.md",
        "agents/implementer.md",
        "agents/tester.md",
        "agents/cleaner.md",
        "runtime/codex/instructions/implementer.md",
        "runtime/codex/instructions/tester.md",
        "runtime/codex/instructions/cleaner.md",
        "skills/pipeline/scripts/specialist-write-scope.mjs",
        "skills/pipeline/scripts/correction-packet-preflight.mjs",
        "tests/test_pipeline_control_plane.mjs",
        "tests/test_specialist_write_scope.mjs",
        "tests/test_correction_packet_preflight.mjs"
      ],
      "dependencies": ["task:1.1", "task:1.2"],
      "required_invariants": ["I-1", "I-2", "I-3", "I-7"],
      "technical_constraints": [
        "TC-5: Lease issue, continuation, revocation, transfer, and close MUST revalidate authority, worktree, mutable paths, immutable inputs, context identity, and exclusive ownership.",
        "TC-6: Capsule certification MUST bind pinned sources and seams once per uninterrupted transaction and reject duplicate normative prompt copies or out-of-scope writes."
      ],
      "quality_command_ids": ["test", "full_suite", "codex_generate_check", "codex_generate_test", "diff_check"],
      "observable_runtime_behavior": true,
      "pre_implementation_test": "required",
      "required_evidence_anchors": ["02-implementation.md", "03-testing.md", "reviews/04-validation.md", "reviews/04-adversary.md"],
      "cross_runtime_preservation": "All runtime packets carry one lease inside the immutable capsule and enforce the same one-writer and pinned-input rules without weakening native permissions.",
      "rollback": "Restore the v4 capsule fields and ownership checks together; do not leave a hybrid packet that duplicates lease authority.",
      "delivery_group": "default",
      "discovery_scope": {
        "directories": ["agents", "agents/_shared", "runtime/codex/instructions", "skills/pipeline/scripts", "tests"],
        "globs": ["agents/*implementer*.md", "agents/*tester*.md", "agents/*cleaner*.md", "agents/_shared/*dispatch*.md", "agents/_shared/*assembly*.md", "agents/_shared/*operational*.md", "runtime/codex/instructions/*implementer*.md", "runtime/codex/instructions/*tester*.md", "runtime/codex/instructions/*cleaner*.md", "skills/pipeline/scripts/*scope*.mjs", "skills/pipeline/scripts/*preflight*.mjs", "tests/test_*scope*.mjs", "tests/test_*preflight*.mjs"]
      },
      "required_seams": [
        {"path": "agents/_shared/dispatch-contract.md", "anchor": "canonical immutable capsule and specialist dispatch contract"},
        {"path": "skills/pipeline/scripts/specialist-write-scope.mjs", "anchor": "canonical mutable ownership enforcement"},
        {"path": "skills/pipeline/scripts/correction-packet-preflight.mjs", "anchor": "capsule certification and pinned-input callsite"},
        {"path": "skills/pipeline/scripts/control-plane.mjs", "anchor": "capability lease validator from task:1.1"}
      ]
    },
    {
      "source_id": "task:2.2",
      "owner": "specialist-results",
      "specialist": "implementer",
      "files": [
        "agents/_shared/output-template.md",
        "agents/_shared/ac-evidence.md",
        "agents/_shared/plan-consolidation.md",
        "agents/architect.md",
        "agents/qa.md",
        "agents/adversary.md",
        "agents/security.md",
        "agents/delivery.md",
        "runtime/codex/instructions/architect.md",
        "runtime/codex/instructions/qa.md",
        "runtime/codex/instructions/security.md",
        "runtime/codex/instructions/delivery.md",
        "plugins/team-harness/skills/pipeline/references/implementation.md",
        "plugins/team-harness/skills/pipeline/references/validation.md",
        "plugins/team-harness/skills/pipeline/references/delivery.md",
        "tests/test_pipeline_control_plane.mjs",
        "tests/test_review_fan.mjs",
        "tests/test_correction_packet_preflight.mjs"
      ],
      "dependencies": ["task:1.1", "task:1.2", "task:2.1"],
      "required_invariants": ["I-1", "I-3", "I-4", "I-5", "I-7"],
      "technical_constraints": [
        "TC-7: Result acceptance MUST bind the active lease, immutable inputs, observed log sequence, changed/evidence paths, and terminal identity; duplicate results MUST be idempotent.",
        "TC-8: Finding and closure fields MUST use closed structured vocabularies with bounded diagnostics, and specialists MUST NOT write coordinator projections or choose phases, Gates, or peers."
      ],
      "quality_command_ids": ["test", "full_suite", "codex_generate_check", "codex_generate_test", "diff_check"],
      "observable_runtime_behavior": true,
      "pre_implementation_test": "required",
      "required_evidence_anchors": ["02-implementation.md", "03-testing.md", "reviews/04-validation.md", "reviews/04-adversary.md"],
      "cross_runtime_preservation": "Claude, Codex, and opencode specialists return the same role-appropriate envelope semantics through their native terminal channel, with Main-only acceptance and projection.",
      "rollback": "Restore role returns and Main consolidation to the v4 result shape as one unit before cutover; retain accepted v5 envelopes as immutable evidence.",
      "delivery_group": "default",
      "discovery_scope": {
        "directories": ["agents", "agents/_shared", "runtime/codex/instructions", "plugins/team-harness/skills/pipeline/references", "tests"],
        "globs": ["agents/*architect*.md", "agents/*qa*.md", "agents/*adversary*.md", "agents/*security*.md", "agents/*delivery*.md", "agents/_shared/*output*.md", "agents/_shared/*evidence*.md", "agents/_shared/*consolidation*.md", "runtime/codex/instructions/*architect*.md", "runtime/codex/instructions/*qa*.md", "runtime/codex/instructions/*security*.md", "runtime/codex/instructions/*delivery*.md", "plugins/team-harness/skills/pipeline/references/*implementation*.md", "plugins/team-harness/skills/pipeline/references/*validation*.md", "plugins/team-harness/skills/pipeline/references/*delivery*.md", "tests/test_*review*.mjs", "tests/test_*control*.mjs"]
      },
      "required_seams": [
        {"path": "skills/pipeline/scripts/control-plane.mjs", "anchor": "result envelope validation and accepted-result append from task:1.1"},
        {"path": "agents/_shared/output-template.md", "anchor": "canonical specialist terminal result shape"},
        {"path": "plugins/team-harness/skills/pipeline/references/validation.md", "anchor": "Main result-acceptance and validation callsite"}
      ]
    },
    {
      "source_id": "task:2.3",
      "owner": "causal-recovery",
      "specialist": "implementer",
      "files": [
        "skills/pipeline/scripts/specialist-liveness.mjs",
        "agents/_shared/coordinator-liveness.md",
        "agents/_shared/coordinator-recovery.md",
        "agents/ref-pipeline.md",
        "plugins/team-harness/skills/pipeline/SKILL.md",
        "plugins/team-harness/skills/pipeline/references/recovery.md",
        "plugins/team-harness/skills/pipeline/references/implementation.md",
        "plugins/team-harness/skills/pipeline/references/validation.md",
        "runtime/codex/instructions/implementer.md",
        "runtime/codex/instructions/tester.md",
        "runtime/codex/instructions/cleaner.md",
        "runtime/codex/instructions/qa.md",
        "runtime/codex/instructions/security.md",
        "runtime/codex/instructions/delivery.md",
        "tests/test_pipeline_control_plane.mjs",
        "tests/test_specialist_liveness.mjs"
      ],
      "dependencies": ["task:1.1", "task:1.2", "task:2.1", "task:2.2"],
      "required_invariants": ["I-2", "I-3", "I-4", "I-7", "I-9"],
      "technical_constraints": [
        "TC-9: Probe, attempt, correction, elapsed-time, token, and tool-call counts MUST remain telemetry and MUST NOT select recovery action or terminal status.",
        "TC-10: Recovery MUST preserve safe progress, prove mutable ownership, rotate on identity/context/independent-lens changes, refresh QA for every changed Freeze, and refresh security when impact is true or unknown."
      ],
      "quality_command_ids": ["test", "full_suite", "codex_generate_check", "codex_generate_test", "diff_check"],
      "observable_runtime_behavior": true,
      "pre_implementation_test": "required",
      "required_evidence_anchors": ["02-implementation.md", "03-testing.md", "reviews/04-validation.md", "reviews/04-adversary.md"],
      "cross_runtime_preservation": "Every runtime reports identical liveness facts and applies the same causal continuation, ownership audit, fresh-lens, and no-ordinal routing rules.",
      "rollback": "Restore the v4 liveness classifier and recovery contract together before cutover; never reinterpret v5 observations as a fixed retry allowance.",
      "delivery_group": "default",
      "discovery_scope": {
        "directories": ["skills/pipeline/scripts", "agents", "agents/_shared", "runtime/codex/instructions", "plugins/team-harness/skills/pipeline", "plugins/team-harness/skills/pipeline/references", "tests"],
        "globs": ["skills/pipeline/scripts/*liveness*.mjs", "agents/ref-pipeline*.md", "agents/_shared/*recovery*.md", "agents/_shared/*liveness*.md", "runtime/codex/instructions/*implementer*.md", "runtime/codex/instructions/*tester*.md", "runtime/codex/instructions/*cleaner*.md", "runtime/codex/instructions/*qa*.md", "runtime/codex/instructions/*security*.md", "runtime/codex/instructions/*delivery*.md", "plugins/team-harness/skills/pipeline/*SKILL.md", "plugins/team-harness/skills/pipeline/references/*recovery*.md", "plugins/team-harness/skills/pipeline/references/*implementation*.md", "plugins/team-harness/skills/pipeline/references/*validation*.md", "tests/test_*liveness*.mjs"]
      },
      "required_seams": [
        {"path": "skills/pipeline/scripts/specialist-liveness.mjs", "anchor": "fact-only liveness classifier"},
        {"path": "agents/_shared/coordinator-recovery.md", "anchor": "causal continuation, replacement, and pause decision contract"},
        {"path": "skills/pipeline/scripts/control-plane.mjs", "anchor": "lease lifecycle and causal identity from task:1.1"}
      ]
    },
    {
      "source_id": "task:3.1",
      "owner": "runtime-preflight",
      "specialist": "implementer",
      "files": [
        "skills/pipeline/SKILL.md",
        "plugins/team-harness/skills/pipeline/SKILL.md",
        "plugins/team-harness/skills/pipeline/references/activation.md",
        "agents/ref-pipeline.md",
        "agents/_shared/orchestrator-state.md",
        "runtime/schema/codex-agents.json",
        "tools/codex-runtime/generate.mjs",
        "tools/codex-runtime/test_generate.mjs",
        "tests/test_pipeline_control_plane.mjs",
        "tests/test_codex_runtime.py",
        "docs/codex-runtime.md"
      ],
      "dependencies": ["task:2.3"],
      "required_invariants": ["I-1", "I-3", "I-7", "I-9"],
      "technical_constraints": [
        "TC-11: Deferred preflight MUST use the existing canonical registry and generated-role freshness checks and MUST preserve prior authority, workspace, and evidence on failure.",
        "TC-12: Model/effort metadata MUST carry no Gate, scope, or outward authority, MUST exclude secrets, and MUST be requested again only when the persisted profile is unavailable."
      ],
      "quality_command_ids": ["test", "full_suite", "codex_generate_check", "codex_generate_test", "diff_check"],
      "observable_runtime_behavior": true,
      "pre_implementation_test": "required",
      "required_evidence_anchors": ["02-implementation.md", "03-testing.md", "reviews/04-validation.md", "reviews/04-adversary.md"],
      "cross_runtime_preservation": "Claude, Codex, and opencode stage role validation at the same dispatch boundary while retaining their installed model profile and native sandbox policy.",
      "rollback": "Restore activation-wide role validation and remove resumable profile metadata before cutover without altering recorded Gate authority or completed work.",
      "delivery_group": "default",
      "discovery_scope": {
        "directories": ["skills/pipeline", "plugins/team-harness/skills/pipeline", "plugins/team-harness/skills/pipeline/references", "agents", "agents/_shared", "runtime/schema", "tools/codex-runtime", "tests", "docs"],
        "globs": ["skills/pipeline/*SKILL.md", "plugins/team-harness/skills/pipeline/*SKILL.md", "plugins/team-harness/skills/pipeline/references/*activation*.md", "agents/ref-pipeline*.md", "agents/_shared/*state*.md", "runtime/schema/*codex*.json", "tools/codex-runtime/*.mjs", "tests/test_codex_runtime*.py", "docs/codex-runtime*.md"]
      },
      "required_seams": [
        {"path": "plugins/team-harness/skills/pipeline/references/activation.md", "anchor": "pipeline activation and staged role-preflight callsite"},
        {"path": "runtime/schema/codex-agents.json", "anchor": "canonical Codex role registry and profile declarations"},
        {"path": "tools/codex-runtime/generate.mjs", "anchor": "generated-role freshness and projection registry"}
      ]
    },
    {
      "source_id": "task:3.2",
      "owner": "freeze-quality",
      "specialist": "implementer",
      "files": [
        "skills/pipeline/scripts/code-hygiene.mjs",
        "skills/pipeline/scripts/quality-lib.mjs",
        "skills/pipeline/scripts/quality-runner.mjs",
        "skills/pipeline/scripts/test-transition.mjs",
        "agents/cleaner.md",
        "agents/tester.md",
        "agents/ref-pipeline.md",
        "plugins/team-harness/skills/pipeline/references/implementation.md",
        "plugins/team-harness/skills/pipeline/references/validation.md",
        "tests/test_pipeline_control_plane.mjs",
        "tests/test_code_hygiene.mjs",
        "tests/test_quality_runner.mjs",
        "tests/test_test_transition.mjs",
        "docs/cleaner-crap.md",
        "docs/code-hygiene-gate.md",
        "docs/quality-runner.md",
        "docs/test-contract-runner.md"
      ],
      "dependencies": ["task:3.1"],
      "required_invariants": ["I-4", "I-7", "I-8", "I-9"],
      "technical_constraints": [
        "TC-13: Cleaner eligibility MUST be deterministic and behavior-preserving; an empty allowlist is an evidenced no-op and any semantic or out-of-allowlist proposal returns to its owning role.",
        "TC-14: Complete quality MUST bind one candidate identity and rerun only after that identity changes; pre-implementation checks MUST NOT emit or imply a final quality verdict."
      ],
      "quality_command_ids": ["test", "full_suite", "diff_check"],
      "observable_runtime_behavior": true,
      "pre_implementation_test": "required",
      "required_evidence_anchors": ["02-implementation.md", "03-testing.md", "reviews/04-validation.md", "reviews/04-adversary.md"],
      "cross_runtime_preservation": "All runtimes use the same deterministic cleaner allowlist, red-to-green boundary, candidate identity, and once-per-candidate Freeze quality semantics.",
      "rollback": "Restore v4 cleaner and quality orchestration together before cutover; retain prior quality envelopes and never relabel a preflight check as a Freeze verdict.",
      "delivery_group": "default",
      "discovery_scope": {
        "directories": ["skills/pipeline/scripts", "agents", "plugins/team-harness/skills/pipeline/references", "tests", "docs"],
        "globs": ["skills/pipeline/scripts/*quality*.mjs", "skills/pipeline/scripts/*hygiene*.mjs", "skills/pipeline/scripts/*transition*.mjs", "agents/**/*cleaner*.md", "tests/test_*quality*.mjs", "tests/test_*hygiene*.mjs", "docs/*quality*.md", "docs/*cleaner*.md"]
      },
      "required_seams": [
        {"path": "skills/pipeline/scripts/code-hygiene.mjs", "anchor": "deterministic cleanup eligibility and allowlist result"},
        {"path": "skills/pipeline/scripts/quality-runner.mjs", "anchor": "candidate-bound complete quality invocation"},
        {"path": "skills/pipeline/scripts/test-transition.mjs", "anchor": "per-task RED-to-GREEN transition"}
      ]
    },
    {
      "source_id": "task:4.1",
      "owner": "pipeline-migration",
      "specialist": "implementer",
      "files": [
        "skills/pipeline/scripts/control-plane.mjs",
        "skills/pipeline/scripts/openspec-bindings.mjs",
        "skills/pipeline/scripts/openspec-recovery.mjs",
        "skills/pipeline/scripts/openspec-events.mjs",
        "plugins/team-harness/skills/pipeline/references/state-and-gates.md",
        "plugins/team-harness/skills/pipeline/references/recovery.md",
        "tests/test_pipeline_control_plane.mjs",
        "tests/test_openspec_bindings.mjs",
        "tests/test_openspec_recovery.mjs",
        "tests/test_openspec_events.mjs",
        "docs/openspec-v1-gate-migration.md"
      ],
      "dependencies": ["task:3.2"],
      "required_invariants": ["I-1", "I-3", "I-5", "I-6", "I-7", "I-9"],
      "technical_constraints": [
        "TC-15: Conversion MUST validate historical authority, bindings, immutable inputs, dirty progress, original Gate, continuation identity, repair evidence, and service diagnostics without inferring a missing decision.",
        "TC-16: The switch pointer MUST commit last, mixed writable schemas MUST fail closed, and rollback MUST read but never overwrite an existing valid v5 workspace with v4 state."
      ],
      "quality_command_ids": ["test", "full_suite", "diff_check"],
      "observable_runtime_behavior": true,
      "pre_implementation_test": "required",
      "required_evidence_anchors": ["02-implementation.md", "03-testing.md", "reviews/04-validation.md", "reviews/04-adversary.md"],
      "cross_runtime_preservation": "Every runtime converts the same supported v1-v4 evidence into the same v5 identities, precise service diagnostics, continuation authorization, and mixed-schema refusal.",
      "rollback": "Before switch, delete only the staged v5 output; after switch, preserve v5 bytes and use a compatible reader without writing reconstructed v4 state.",
      "delivery_group": "default",
      "discovery_scope": {
        "directories": ["skills/pipeline/scripts", "plugins/team-harness/skills/pipeline/references", "tests", "docs"],
        "globs": ["skills/pipeline/scripts/*control*.mjs", "skills/pipeline/scripts/*bindings*.mjs", "skills/pipeline/scripts/*recovery*.mjs", "skills/pipeline/scripts/*events*.mjs", "plugins/team-harness/skills/pipeline/references/*state*.md", "plugins/team-harness/skills/pipeline/references/*recovery*.md", "tests/test_openspec_bindings*.mjs", "tests/test_openspec_recovery*.mjs", "tests/test_openspec_events*.mjs", "tests/test_*control*.mjs", "docs/openspec-*migration*.md"]
      },
      "required_seams": [
        {"path": "skills/pipeline/scripts/control-plane.mjs", "anchor": "v1-v4 create-then-switch converter and v5 state reader"},
        {"path": "skills/pipeline/scripts/openspec-bindings.mjs", "anchor": "precise service binding diagnostics and legacy continuation verification"},
        {"path": "skills/pipeline/scripts/openspec-recovery.mjs", "anchor": "current dispatch/recovery version boundary"}
      ]
    },
    {
      "source_id": "task:5.1",
      "owner": "runtime-packaging",
      "specialist": "implementer",
      "files": [
        "tools/codex-runtime/sync-skills.mjs",
        "tools/codex-runtime/generate.mjs",
        "tools/codex-runtime/test_generate.mjs",
        "tests/test_pipeline_control_plane.mjs",
        "tests/test_codex_runtime.py",
        "tests/test_codex_pipeline_benchmark.mjs",
        "tests/benchmark_codex_pipeline_efficiency.mjs",
        "tests/run-all.sh",
        "tests/run-behavioral.sh",
        "runtime/codex/README.md",
        "docs/how-it-works.md",
        "docs/pipelines.md",
        "docs/lifecycle.md",
        "docs/observability.md",
        "docs/openspec-integration.md",
        "docs/testing.md",
        "docs/verification-packet.md",
        "docs/conventions.md",
        "changelog.d/simplify-pipeline-control-plane.md",
        "plugins/team-harness/docs/code-hygiene-gate.md",
        "plugins/team-harness/docs/verification-packet.md",
        "plugins/team-harness/skills/pipeline/scripts/control-plane.mjs",
        "plugins/team-harness/skills/pipeline/scripts/helper-bundle.mjs",
        "plugins/team-harness/skills/pipeline/scripts/specialist-write-scope.mjs",
        "plugins/team-harness/skills/pipeline/scripts/correction-packet-preflight.mjs",
        "plugins/team-harness/skills/pipeline/scripts/specialist-liveness.mjs",
        "plugins/team-harness/skills/pipeline/scripts/code-hygiene.mjs",
        "plugins/team-harness/skills/pipeline/scripts/quality-lib.mjs",
        "plugins/team-harness/skills/pipeline/scripts/quality-runner.mjs",
        "plugins/team-harness/skills/pipeline/scripts/test-transition.mjs",
        "plugins/team-harness/skills/pipeline/scripts/openspec-bindings.mjs",
        "plugins/team-harness/skills/pipeline/scripts/openspec-recovery.mjs",
        "plugins/team-harness/skills/pipeline/scripts/openspec-events.mjs",
        "plugins/team-harness/agents/architect.md",
        "plugins/team-harness/agents/implementer.md",
        "plugins/team-harness/agents/tester.md",
        "plugins/team-harness/agents/cleaner.md",
        "plugins/team-harness/agents/qa.md",
        "plugins/team-harness/agents/adversary.md",
        "plugins/team-harness/agents/security.md",
        "plugins/team-harness/agents/delivery.md",
        "plugins/team-harness/agents/orchestrator.md",
        "plugins/team-harness/agents/ref-pipeline.md",
        "plugins/team-harness/agents/_shared/dispatch-contract.md",
        "plugins/team-harness/agents/_shared/orchestrator-state.md",
        "plugins/team-harness/agents/_shared/gate-contract.md",
        "plugins/team-harness/agents/_shared/coordinator-recovery.md",
        "plugins/team-harness/agents/_shared/coordinator-liveness.md",
        "plugins/team-harness/agents/_shared/output-template.md",
        "plugins/team-harness/agents/_shared/ac-evidence.md",
        "plugins/team-harness/agents/_shared/plan-consolidation.md",
        "plugins/team-harness/agents/_shared/implementation-assembly.md",
        "plugins/team-harness/agents/_shared/operational-rules.md",
        ".codex/agents/architect.toml",
        ".codex/agents/pipeline-architect.toml",
        ".codex/agents/implementer.toml",
        ".codex/agents/pipeline-implementer.toml",
        ".codex/agents/tester.toml",
        ".codex/agents/pipeline-tester.toml",
        ".codex/agents/cleaner.toml",
        ".codex/agents/pipeline-cleaner.toml",
        ".codex/agents/qa.toml",
        ".codex/agents/pipeline-qa.toml",
        ".codex/agents/security.toml",
        ".codex/agents/pipeline-security.toml",
        ".codex/agents/delivery.toml",
        ".codex/agents/pipeline-delivery.toml",
        "plugins/team-harness/skills/setup/assets/agents/architect.toml",
        "plugins/team-harness/skills/setup/assets/agents/pipeline-architect.toml",
        "plugins/team-harness/skills/setup/assets/agents/implementer.toml",
        "plugins/team-harness/skills/setup/assets/agents/pipeline-implementer.toml",
        "plugins/team-harness/skills/setup/assets/agents/tester.toml",
        "plugins/team-harness/skills/setup/assets/agents/pipeline-tester.toml",
        "plugins/team-harness/skills/setup/assets/agents/cleaner.toml",
        "plugins/team-harness/skills/setup/assets/agents/pipeline-cleaner.toml",
        "plugins/team-harness/skills/setup/assets/agents/qa.toml",
        "plugins/team-harness/skills/setup/assets/agents/pipeline-qa.toml",
        "plugins/team-harness/skills/setup/assets/agents/security.toml",
        "plugins/team-harness/skills/setup/assets/agents/pipeline-security.toml",
        "plugins/team-harness/skills/setup/assets/agents/delivery.toml",
        "plugins/team-harness/skills/setup/assets/agents/pipeline-delivery.toml"
      ],
      "dependencies": ["task:4.1"],
      "required_invariants": ["I-1", "I-2", "I-3", "I-4", "I-5", "I-6", "I-7", "I-8", "I-9"],
      "technical_constraints": [
        "TC-17: Generated and packaged projections MUST preserve the v5 schemas, authority, ownership, result, causal-recovery, staged-preflight, and Freeze semantics byte-for-byte where shared and substantively where runtime adapters differ.",
        "TC-18: Current semantic and generated surfaces MUST contain no executable TH-LIVENESS-RESUME, single retry, max-3, N/3, retry-exhausted, one-replacement, or ambiguous correction-round route; historical fixtures and migration documentation MUST be explicitly classified as legacy."
      ],
      "quality_command_ids": ["test", "full_suite", "behavioral", "codex_generate_check", "codex_generate_test", "diff_check"],
      "observable_runtime_behavior": true,
      "pre_implementation_test": "required",
      "required_evidence_anchors": ["02-implementation.md", "03-testing.md", "reviews/04-validation.md", "reviews/04-adversary.md", "00-pipeline-summary.md"],
      "cross_runtime_preservation": "Canonical Claude skills and helpers, Codex adapters and TOMLs, opencode assets, installed plugin copies, and documentation expose the same two primitives and v5 routing while retaining native permission boundaries.",
      "rollback": "Revert generated outputs with their canonical inputs as one change, keep the v5 reader for any converted workspace, and never publish mixed-version plugin assets.",
      "delivery_group": "default",
      "discovery_scope": {
        "directories": ["agents", "agents/_shared", "skills/pipeline/scripts", "runtime/codex", "tools/codex-runtime", "plugins/team-harness/agents", "plugins/team-harness/agents/_shared", "plugins/team-harness/skills/pipeline/scripts", "plugins/team-harness/skills/setup/assets/agents", "plugins/team-harness/docs", ".codex/agents", "tests", "docs", "changelog.d"],
        "globs": ["agents/*.md", "agents/_shared/*.md", "skills/pipeline/scripts/*.mjs", "runtime/codex/**/*.md", "tools/codex-runtime/*.mjs", "plugins/team-harness/agents/*.md", "plugins/team-harness/agents/_shared/*.md", "plugins/team-harness/skills/pipeline/scripts/*.mjs", "plugins/team-harness/skills/setup/assets/agents/*.toml", "plugins/team-harness/docs/*.md", ".codex/agents/*.toml", "tests/test_*pipeline*.mjs", "tests/run-*.sh", "docs/*.md", "changelog.d/*.md"]
      },
      "required_seams": [
        {"path": "tools/codex-runtime/sync-skills.mjs", "anchor": "canonical helper, agent, documentation, and runtime projection registry"},
        {"path": "tools/codex-runtime/generate.mjs", "anchor": "Codex agent TOML generator and freshness check"},
        {"path": "tests/run-all.sh", "anchor": "complete repository suite registry"},
        {"path": "plugins/team-harness/skills/pipeline/scripts/control-plane.mjs", "anchor": "installed v5 control-plane runtime entrypoint"}
      ]
    }
  ]
}
```
