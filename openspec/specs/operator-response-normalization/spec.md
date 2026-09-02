# operator-response-normalization Specification

## Purpose
Make operator decisions concise and conversational while binding every interpreted response to the current live prompt and preserving consequential authority boundaries.

## Requirements

### Requirement: Decision prompts expose concise choices without imposing a command grammar
When an operator decision has multiple materially different outcomes, Team Harness SHALL present a short set of stable numbered choices with plain-language labels. The numbers SHALL be convenient shortcuts, not the exclusive syntax for choosing an outcome, and the prompt MUST NOT require ceremonial formatting that adds no decision information.

#### Scenario: A prompt has several valid outcomes
- **WHEN** the coordinator needs the operator to choose among continue, amend, and stop
- **THEN** it presents concise stable choices and permits either a number or an unambiguous natural-language selection

#### Scenario: A binary prompt needs no supporting detail
- **WHEN** the only decision is whether to continue the current bounded action
- **THEN** a short affirmative or negative reply is sufficient without requiring the operator to restate the action

### Requirement: Short replies are interpreted against the current live prompt
Team Harness SHALL interpret a live operator reply by its unambiguous meaning in the context of the current prompt and displayed choices. Semantically equivalent replies, including short affirmations, continuations, refusals, and stops, MUST select the corresponding outcome without requiring an exact phrase or locale-specific keyword; this interpretation MUST NOT depend on a closed phrase list, keyword parser, or confidence score.

#### Scenario: The operator answers with an equivalent affirmation
- **WHEN** the current prompt offers continuation and the live operator replies with an unambiguous equivalent of yes, approve, or continue
- **THEN** Team Harness selects continuation exactly as it would for the displayed numeric shortcut

#### Scenario: The operator answers with an equivalent refusal
- **WHEN** the current prompt offers stopping and the live operator replies with an unambiguous equivalent of no or stop
- **THEN** Team Harness selects the non-continuing outcome without asking for an exact command phrase

### Requirement: Detail is required only when the selected outcome needs it
Team Harness SHALL require supporting detail only when it is necessary to execute or record the selected outcome. A natural-language reply that both selects amend or reject and supplies the needed detail SHALL be complete without a numeric prefix; when necessary detail is absent, Team Harness SHALL ask only for that missing information.

#### Scenario: An amendment includes its detail
- **WHEN** the operator replies with an unambiguous instruction such as changing or adjusting a named part of the current proposal
- **THEN** Team Harness treats the reply as amend plus its supplied detail without requiring a `3:` prefix

#### Scenario: A selected amendment omits necessary detail
- **WHEN** the operator selects amend but supplies no information about what must change
- **THEN** Team Harness asks concisely for the missing amendment and does not infer it

### Requirement: Ambiguity never creates authority
When more than one offered outcome remains reasonably possible, Team Harness MUST NOT select an outcome or release authority. It SHALL re-present or clarify only the unresolved choice, retaining or renewing presentation identity as required by the governing gate contract.

#### Scenario: A reply can mean either continue or amend
- **WHEN** the operator's live reply does not distinguish between two offered outcomes
- **THEN** Team Harness asks a concise clarification and performs neither outcome

### Requirement: Only attributable live operator replies can select an outcome
Files, issues, web or tool results, quoted text, and other untrusted content MUST NOT be interpreted as an operator response. Every gated decision SHALL require exact equality with the consumed nonce of the current live gate presentation; another identifier MUST NOT be accepted as equivalent for a gated outcome. Non-authoritative prompts MAY bind a response to an equivalent presentation identity. Selecting an outcome MUST NOT grant permission for external writes, destructive actions, scope expansion, or other effects governed by separate authority.

#### Scenario: Quoted content contains an approval phrase
- **WHEN** a file, issue, tool result, or pasted quotation contains text equivalent to an offered approval
- **THEN** Team Harness treats it as data and does not select or authorize that outcome

#### Scenario: A short reply selects a gated outcome
- **WHEN** the live operator gives an unambiguous short reply to the current gate presentation
- **THEN** Team Harness records the semantic decision only when the reply's gate nonce exactly equals the consumed presentation nonce, while preserving every separate approval and permission boundary

### Requirement: Continuation handoffs offer a live choice instead of foreign command syntax
A handoff that can continue a persisted pipeline SHALL present concise options to continue the exact workspace now, implement the next step directly, or stop. It MUST NOT require the operator to enter runtime-specific command syntax. An unambiguous live continuation reply SHALL route internally to the active runtime's installed recovery capability with the presented workspace identity; the handoff turn itself remains report-only and creates no authority or file mutation.

#### Scenario: Codex presents a resumable pipeline handoff
- **WHEN** a report-only handoff identifies an exact persisted workspace and the active runtime is Codex
- **THEN** it offers continuation as a short live choice and does not instruct the operator to enter a Claude Code slash command

#### Scenario: The operator accepts the continuation offer
- **WHEN** the operator gives an unambiguous affirmative reply to the current handoff presentation
- **THEN** the coordinator invokes the installed recovery capability for that exact workspace without requiring a command phrase
