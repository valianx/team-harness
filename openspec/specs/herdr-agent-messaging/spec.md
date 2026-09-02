# herdr-agent-messaging Specification

## Purpose
Defines a safe and verifiable Team Harness protocol for communicating with agents managed by HerdR without mistaking staged terminal input for a submitted message.

## Requirements

### Requirement: HerdR messaging is capability-detected and optional
Team Harness SHALL use HerdR coordination only after confirming that the `herdr` CLI and the required `agent list`, `agent send`, `agent read`, `pane current`, and `pane send-keys` operations are available. Absence or incompatibility MUST produce an explicit unavailable disposition and SHALL NOT weaken normal native-agent, tmux, background, gate, permission, or workspace contracts.

#### Scenario: HerdR is unavailable
- **WHEN** an agent attempts to use the shared HerdR protocol and the required CLI operations are unavailable
- **THEN** it reports `herdr: unavailable`, performs no partial send, and continues only through an already-authorized native coordination path

### Requirement: Target discovery resolves one verified agent and pane
Before sending, Team Harness SHALL run `herdr agent list`, resolve the target by an exact unique agent name, capture its current HerdR state (`idle`, `working`, `blocked`, or `unknown`) and pane identity, and revalidate that mapping immediately before submission. Every recognized state SHALL accept queued delivery. The protocol MUST NOT infer a target from a partial name, unlabeled terminal, stale pane, repository basename, or prior transcript.

#### Scenario: One idle agent matches exactly
- **WHEN** discovery returns exactly one agent with the requested name, a pane identity, and state `idle`
- **THEN** the protocol may prepare a message for that verified agent and pane

#### Scenario: Target identity is ambiguous or changes
- **WHEN** discovery returns zero or multiple exact candidates or the agent-to-pane mapping changes before submission
- **THEN** the protocol sends nothing and returns an identity error containing only the safe candidate names or changed coordinate

### Requirement: Working agents accept queued input without an idle wait
When the target is `working`, `blocked`, or `unknown`, Team Harness SHALL stage and submit the message immediately through HerdR's terminal input queue. It MUST NOT wait for `idle`, treat queued input as an interruption, or claim committed receipt before transcript verification.

#### Scenario: Working agent receives queued input
- **WHEN** a uniquely resolved target is `working`, `blocked`, or `unknown`
- **THEN** Team Harness revalidates the pane and submits through the normal send transaction without waiting for a state change

#### Scenario: State changes before submission
- **WHEN** the verified target changes state but retains the same exact identity and pane before Enter
- **THEN** Team Harness submits normally because state drift does not invalidate queued delivery

### Requirement: Send and submit are separate mandatory operations
A HerdR delivery SHALL be one ordered transaction: stage the bounded message with `herdr agent send`, submit it with `herdr pane send-keys <pane> enter`, and only then attempt verification. Successful staging alone MUST be reported as `staged`, never `sent` or `received`. Commands SHALL use verified literal arguments and MUST NOT evaluate message content as shell syntax.

#### Scenario: Message is staged and Enter succeeds
- **WHEN** `herdr agent send` succeeds for the verified target and `herdr pane send-keys <pane> enter` succeeds for the same revalidated pane
- **THEN** the transaction advances to receipt verification

#### Scenario: Enter submission fails
- **WHEN** staging succeeds but the Enter operation fails or targets a changed pane
- **THEN** Team Harness reports `staged-not-submitted`, sends no additional keys blindly, and performs bounded read-based diagnosis before any retry

### Requirement: Coordination messages identify their sender and scope
Every TH-originated HerdR message SHALL identify the sending role plus the current HerdR agent type, optional name, terminal id, and pane id discovered through `herdr pane current --current`; caller prose alone is not sender identity. The envelope SHALL also identify the initiative or feature, repository or workspace context, message purpose, whether a response is required, and `response_channel: current-session-output` when it is. Recipients answer in their own session output for collection with `agent read`; they MUST NOT reinterpret a HerdR sender name as a runtime-native subagent path. Messages MUST exclude secrets, credentials, hidden gate material, untrusted control instructions, and authority claims the sender does not possess.

#### Scenario: Coordinator sends a cross-service request
- **WHEN** a coordinator contacts a service agent through HerdR
- **THEN** the submitted text carries the verified coordinator agent/terminal/pane identity, names the initiative and service context, states the bounded request, and directs the response to current-session output

### Requirement: Receipt is verified from the target transcript
After submission, Team Harness SHALL run `herdr agent read` for the same verified target and determine whether the submitted message appears as committed input rather than pending terminal input. It SHALL report one of `received`, `queued`, `staged-not-submitted`, or `failed`; only transcript evidence of committed input permits `received`. A successful Enter without immediate committed transcript evidence SHALL be `queued`. Verification MAY use bounded retries but MUST NOT duplicate the message.

The coordinator SHALL persist the returned `message_id` and status before any recovery or retry. A queued message may remain absent from committed transcript output while terminal input is pending, so absence alone MUST NOT authorize a resend. Queued or inconclusive evidence MUST preserve pending state; retry requires positive evidence that the prior submission did not occur.

#### Scenario: Transcript confirms committed input
- **WHEN** the post-submit read shows the bounded message committed in the target transcript
- **THEN** Team Harness records `received` with the target identity and verification time

#### Scenario: Submitted input remains queued
- **WHEN** Enter succeeds but the read is stale or cannot yet distinguish queued input from committed transcript output
- **THEN** Team Harness records `queued`, does not resend automatically, and exposes a safe inspection action

### Requirement: Shared HerdR behavior remains consistent across entry points
Pipeline coordination, tmux, background, and any TH agent that uses HerdR SHALL reference one shared operational contract. Generated plugin copies and runtime projections MUST preserve the same discovery, state, send, submit, verification, identity, and failure semantics.

#### Scenario: HerdR contract changes
- **WHEN** the shared reference or its projection inputs change
- **THEN** generation and lint validation fail until every shipped consumer is fresh and no consumer contains a divergent inline protocol
