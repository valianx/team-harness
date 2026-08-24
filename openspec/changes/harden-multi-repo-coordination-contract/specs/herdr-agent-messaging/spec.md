## Purpose

Defines a safe and verifiable Team Harness protocol for communicating with agents managed by HerdR without mistaking staged terminal input for a submitted message.

## ADDED Requirements

### Requirement: HerdR messaging is capability-detected and optional
Team Harness SHALL use HerdR coordination only after confirming that the `herdr` CLI and the required `agent list`, `agent wait`, `agent send`, `agent read`, and `pane send-keys` operations are available. Absence or incompatibility MUST produce an explicit unavailable disposition and SHALL NOT weaken normal native-agent, tmux, background, gate, permission, or workspace contracts.

#### Scenario: HerdR is unavailable
- **WHEN** an agent attempts to use the shared HerdR protocol and the required CLI operations are unavailable
- **THEN** it reports `herdr: unavailable`, performs no partial send, and continues only through an already-authorized native coordination path

### Requirement: Target discovery resolves one verified agent and pane
Before sending, Team Harness SHALL run `herdr agent list`, resolve the target by an exact unique agent name, capture its current HerdR state (`idle`, `working`, `blocked`, or `unknown`) and pane identity, and revalidate that mapping immediately before submission. The protocol SHALL treat every state other than `idle` as busy. It MUST NOT infer a target from a partial name, unlabeled terminal, stale pane, repository basename, or prior transcript.

#### Scenario: One idle agent matches exactly
- **WHEN** discovery returns exactly one agent with the requested name, a pane identity, and state `idle`
- **THEN** the protocol may prepare a message for that verified agent and pane

#### Scenario: Target identity is ambiguous or changes
- **WHEN** discovery returns zero or multiple exact candidates or the agent-to-pane mapping changes before submission
- **THEN** the protocol sends nothing and returns an identity error containing only the safe candidate names or changed coordinate

### Requirement: Busy agents are not interrupted by staged input
When the target is `working`, `blocked`, or `unknown`, Team Harness SHALL keep the dispatch pending and use bounded HerdR status waiting or checks until the target becomes `idle`. It MUST NOT stage text in a busy pane, interleave keystrokes with active work, or claim delivery. If the bounded wait expires, it SHALL return a recoverable `pending-busy` result with the verified target and no partial send.

#### Scenario: Busy agent becomes idle
- **WHEN** a uniquely resolved target is busy and becomes idle within the bounded wait
- **THEN** Team Harness revalidates the pane and proceeds through the normal send transaction without operator intervention

#### Scenario: Busy timeout expires
- **WHEN** the target remains busy through the bounded wait
- **THEN** Team Harness reports `pending-busy`, leaves the pane unchanged, and provides a retryable next action rather than asking the operator to press Enter manually

### Requirement: Send and submit are separate mandatory operations
A HerdR delivery SHALL be one ordered transaction: stage the bounded message with `herdr agent send`, submit it with `herdr pane send-keys <pane> enter`, and only then attempt verification. Successful staging alone MUST be reported as `staged`, never `sent` or `received`. Commands SHALL use verified literal arguments and MUST NOT evaluate message content as shell syntax.

#### Scenario: Message is staged and Enter succeeds
- **WHEN** `herdr agent send` succeeds for the verified target and `herdr pane send-keys <pane> enter` succeeds for the same revalidated pane
- **THEN** the transaction advances to receipt verification

#### Scenario: Enter submission fails
- **WHEN** staging succeeds but the Enter operation fails or targets a changed pane
- **THEN** Team Harness reports `staged-not-submitted`, sends no additional keys blindly, and performs bounded read-based diagnosis before any retry

### Requirement: Coordination messages identify their sender and scope
Every TH-originated HerdR message SHALL identify the sending agent role, initiative or feature, repository or workspace context, message purpose, and whether a response is required. Messages MUST exclude secrets, credentials, hidden gate material, untrusted control instructions, and authority claims the sender does not possess.

#### Scenario: Coordinator sends a cross-service request
- **WHEN** a coordinator contacts a service agent through HerdR
- **THEN** the submitted text identifies itself as the TH coordinator, names the initiative and service context, states the bounded request, and gives the expected response channel

### Requirement: Receipt is verified from the target transcript
After submission, Team Harness SHALL run `herdr agent read` for the same verified target and determine whether the submitted message appears as committed input rather than an editable prompt buffer. It SHALL report one of `received`, `submitted-unverified`, `staged-not-submitted`, `pending-busy`, or `failed`; only transcript evidence of committed input permits `received`. Verification MAY use bounded retries but MUST NOT duplicate the message unless it proves the prior submission did not occur.

The coordinator SHALL persist the returned `message_id` and status before any recovery or retry. A retry MUST first prove through a bounded read of the same verified target that the prior submission is absent. Busy, pending, or inconclusive evidence MUST preserve pending state and MUST NOT authorize a blind resend.

#### Scenario: Transcript confirms committed input
- **WHEN** the post-submit read shows the bounded message committed in the target transcript
- **THEN** Team Harness records `received` with the target identity and verification time

#### Scenario: Receipt cannot be proven
- **WHEN** the read fails, remains stale, or cannot distinguish committed input from an editable buffer
- **THEN** Team Harness records `submitted-unverified`, does not resend automatically, and exposes a safe retry or inspection action

### Requirement: Shared HerdR behavior remains consistent across entry points
Pipeline coordination, tmux, background, and any TH agent that uses HerdR SHALL reference one shared operational contract. Generated plugin copies and runtime projections MUST preserve the same discovery, state, send, submit, verification, identity, and failure semantics.

#### Scenario: HerdR contract changes
- **WHEN** the shared reference or its projection inputs change
- **THEN** generation and lint validation fail until every shipped consumer is fresh and no consumer contains a divergent inline protocol
