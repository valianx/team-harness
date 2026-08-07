# Functional-First Plan Contract

Stage 1 establishes what observable behavior the operator is approving before
describing how it will be implemented. It preserves the v3 state machine, one
architect dispatch, and the existing Stage Gate 1.

## Operator contract

For every new `sharded-v1` plan, the generated workspace's operator-facing plan
index contains these Review Summary sections in order:

1. Problem and observable outcome.
2. Actors and flows.
3. Business rules and examples.
4. Alternate and error behavior.
5. Unchanged behavior.
6. Non-goals.
7. Decisions for human review.

The first sections use stable bullet labels (`Problem`, `Observable outcome`,
`Actor`, `Rule`, and `Example`). An empty list is explicit as
`None — {reason}`. The summary contains no code fence, implementation
chronology, private symbol, command, file ownership, or `file:line` reference.
A public API or CLI name may appear when that name is itself part of the
supported behavior.

Technical realization remains mandatory but lives in generated workspace
shards identified by the plan manifest:

- architecture shard: approach, patterns and evidence, services,
  engineering risks/trade-offs, assessments, and file-level work plan;
- conditional invariants shard: cross-site invariants and fenced sites;
- delivery shard: dependencies and delivery grouping; and
- task shards: exact scope, ACs, TCs, and verification.

## Deterministic evidence

Before Gate 1, Main runs:

```text
node <loaded-pipeline-skill>/scripts/plan-contract.mjs \
  --workspace <generated-workspace-root> \
  --plan <generated-plan-index>
```

The helper reads only regular, non-symlink artifacts declared by the plan
manifest, bounds their size and count, and emits one closed JSON result. It
verifies functional-section order and labels, path-free summary boundaries,
manifest completeness, architecture section ownership, task-index consistency,
Given/When/Then ACs, separate TCs, and pre-implementation-test routing. The
record includes the plan hash, every artifact hash, and one artifact-set hash.

Main persists the result and hashes as `plan_contract_evidence`. Missing,
failing, stale, or mismatched evidence blocks Gate 1. The tool owns structure,
counts, paths, and identity; Architect and the operator own whether the stated
behavior is the right behavior.

When validation fails, Main runs `plan-contract-repair.mjs` once. Its closed
write scope is limited to adding a canonical task-shard route already present
in the Task Index when that shard is a regular, non-symlink file inside the
workspace. The helper records the original and resulting plan hashes, the exact
routes added, and the post-repair validator result hash. Main reruns validation
and continues to Gate 1 without asking the operator or dispatching Architect
when the contract passes.

The helper cannot edit behavior, scope, decisions, ACs, TCs, task counts,
architecture, delivery, branches, or PR grouping, and it cannot create a
missing shard. Ineligible input is unchanged and returns `blocked`; only the
remaining findings use the one normal Architect correction. Mechanical repair
does not consume a correction or development iteration and never opens an
exceptional Architect round.

Legacy recovery is not migrated implicitly. Historical workspaces and the
documented self-authored minimal-plan routes use only their closed
not-applicable reason.

## Gate 1

Gate 1 synthesizes the observable delta, principal actor/flow, one
representative rule/example, alternate/error behavior, unchanged behavior,
non-goals, and open decisions. It includes technical detail only when the
operator must decide compatibility, security, irreversibility, a public
contract, cost, or an explicit trade-off. No additional review agent, phase, or
gate is introduced.
