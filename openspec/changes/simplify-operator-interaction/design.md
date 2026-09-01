## Context

See `proposal.md` for motivation. Team Harness currently distributes conversational behavior across the coordinator contract, shared operator-dialogue and gate contracts, direct-mode skills and references, managed setup text, documentation, and generated runtime mirrors. Gate authority already depends on a live attributable reply, presentation nonce, and exact approved identities; exact reply spelling is not the security boundary. The implementation must therefore relax human-facing syntax without creating a second authority model or a brittle parser.

The repository also has active capability deltas that define the current effective spec-lane security routing and Gate-1 auto-ship authority. This change must preserve those complete requirement bodies when adding the new interaction behavior.

## Goals / Non-Goals

**Goals:**

- Make routing and decision prompts understandable without teaching operators a command grammar.
- Let the coordinator use conversational context to recognize unambiguous direct-mode intent and short decisions.
- Keep prompts predictable by retaining compact stable choices as visible affordances.
- Preserve nonce attribution, canonical OpenSpec identity, security floors, scope bounds, and external-action approvals.
- Keep canonical sources and generated mirrors synchronized through existing generation paths.

**Non-Goals:**

- Building a keyword parser, response-classification service, confidence model, or new response schema.
- Inferring gated-pipeline activation, gate approval, destructive-action permission, or outward-write authority from general intent.
- Changing the pipeline state model, control-log schema, release policy, or OpenSpec artifact model.
- Adding more validation agents or another review loop to the spec lane.

## Decisions

### 1. Normalize meaning at the conversational coordinator boundary

The coordinator will interpret the current live reply against the prompt it just presented and select an outcome only when the meaning is unambiguous. This uses the model's existing language understanding and the bounded set of displayed outcomes; it does not introduce a phrase dictionary, regular-expression grammar, confidence threshold, or machine-readable response envelope.

The rejected alternative is a deterministic keyword parser. It would recreate the rigidity this change is intended to remove, behave poorly across languages and paraphrases, and provide no additional authority because attribution and identity checks happen after interpretation.

### 2. Keep numbered options as affordances, not protocol tokens

Prompts with materially different paths will continue to show short numbered options in a stable order. Operators may reply with the number, the label, or a semantically equivalent short response. This preserves scanability and gives automation-compatible shortcuts without making a number the only valid form.

The rejected alternative is removing options entirely. Free-form prompts increase ambiguity and operator effort when several routes are genuinely available.

### 3. Carry amendment and rejection detail in the reply itself

An utterance such as `cambia la estrategia de pruebas` is interpreted as both the amend selection and its detail. A prefix such as `3:` remains accepted but is optional. If an operator selects a detail-bearing outcome without the detail needed to act, the coordinator asks only for that missing information.

The rejected alternative is treating every non-numeric reply as invalid or requiring a second turn after an already complete natural-language instruction.

### 4. Separate routing convenience from consequential authority

Intent may select only an established direct mode whose documented predicate passes. The pipeline remains explicit-only. At gates, semantic normalization produces the same bounded decision that a numeric reply would produce, but authority is valid only when the live reply is attributable to the current presentation and nonce and all existing identity checks pass. External writes, destructive actions, security posture changes, and scope expansion retain their own controls.

This keeps strict contracts at consequence boundaries rather than at the wording boundary. A looser alternative that treats conversational intent as generic authorization is rejected because it collapses routing and permission into one unsafe signal.

### 5. Resolve ambiguity with a narrow re-prompt

When more than one offered outcome remains plausible, the coordinator performs no outcome and asks a concise question limited to the unresolved choice or missing detail. Gate presentations retain or renew their nonce according to the existing gate contract; no authority is derived from an ambiguous reply.

The rejected alternative is guessing the most likely outcome. Avoiding one conversational turn is not worth an incorrect route or authority decision.

### 6. Update canonical prose first and regenerate mirrors

Implementation will update the canonical coordinator, shared contracts, source skills, references, and managed setup block, then use existing synchronization and Codex generation tooling for packaged and runtime mirrors. Tests will assert behavioral invariants—explicit-only pipeline activation, live-source attribution, current-presentation binding, and carrier consistency—rather than pinning example prose or maintaining an exhaustive phrase list.

The rejected alternative is editing generated copies directly, which would create drift and make future regeneration overwrite the behavior.

## Risks / Trade-offs

- **[Natural-language interpretation can vary at the edges]** → Limit interpretation to the bounded current prompt; when two outcomes remain plausible, perform neither and clarify.
- **[Relaxed replies could appear to weaken gate security]** → Preserve current-presentation nonce consumption and exact OpenSpec, intent, scope, and security-floor identities; document that wording is not the authority source.
- **[Carrier text can drift across runtimes]** → Update canonical carriers together and run the existing reference-resolution, synchronization, and generation checks.
- **[Tests could accidentally create a new phrase contract]** → Test representative semantic classes and safety invariants, not a closed vocabulary or exact Markdown wording.
- **[Broad direct-mode inference could surprise operators]** → Require both unambiguous live intent and the mode predicate; otherwise present concise options, and never infer pipeline activation.

## Migration Plan

1. Update canonical interaction, gate, routing, and spec-lane sources while preserving all existing authority fields and hard routers.
2. Reconcile managed installation guidance and repository/operator documentation with those canonical sources.
3. Regenerate packaged skills and runtime agent mirrors using the repository's existing generators.
4. Run strict OpenSpec validation, carrier/reference checks, generator freshness checks, and relevant shared-runtime suites.
5. Release as a backward-compatible patch: literal invocations, numeric choices, and prefixed edit/reject replies remain valid.

Rollback consists of reverting the canonical source change and regenerating mirrors. No state or control-log migration is required because the authority representation is unchanged.
