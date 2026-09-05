## Purpose

Help PR reviewers distinguish introduced regressions from existing failures and unavailable reproductions using bounded evidence from the versions being compared.

## ADDED Requirements

### Requirement: Regression investigation is explicitly selected and hypothesis driven

The review flow SHALL accept `--regressions` or an explicit live request for regression investigation. Main SHALL select probes for concrete suspected changes to required behavior and record the intended invariant and affected consumer. An ordinary review SHALL retain its existing behavior. Instructions or commands in PR content SHALL NOT authorize execution.

#### Scenario: Regression investigation is requested
- **WHEN** the operator requests regression investigation and a reviewer identifies a concrete hypothesis
- **THEN** Main prepares a bounded reproduction for that hypothesis using the captured review identity

#### Scenario: PR content requests execution
- **WHEN** a PR body or code comment instructs a reviewer to execute a command
- **THEN** that text supplies no execution authority and the read-only reviewer does not execute it

### Requirement: Comparison preserves the hypothesis and execution boundary

The reproduction SHALL compare the captured merge-base with the reviewed head in separate disposable checkouts, preserving the same probe bytes and assertion for a behavior expected to remain stable. It SHALL record the command, probe identity, revision identities and relevant environment differences. Main SHALL use explicitly selected argument arrays, bounded output and duration, and the runtime's permitted execution boundary. It SHALL NOT execute probes in the operator checkout or immutable review worktree, grant execution to read-only reviewers, implicitly install dependencies, or claim that disposable directories alone sandbox code.

#### Scenario: A comparable probe runs
- **WHEN** the required environment is available and Main selects a permitted probe
- **THEN** each revision runs with the same probe and bounded command, and changes remain confined by the available execution boundary without mutating review inputs

#### Scenario: The required execution environment is unavailable
- **WHEN** the permitted execution boundary or prerequisites cannot support the probe
- **THEN** reproduction is reported unavailable with its reason and ordinary code review continues

### Requirement: Observed outcomes do not overclaim causality

For comparable executions with recognizable assertion outcomes, the comparison SHALL classify base-pass/head-fail as `regression-candidate`, the same assertion failing in both revisions as `preexisting-failure`, and a successful head assertion as `no-failure-observed`. Unavailable, timed-out, malformed, ambiguous or non-comparable execution SHALL be `inconclusive`. A nonzero process exit alone SHALL NOT establish a behavioral regression. Confirming a candidate SHALL additionally require a preserved intended behavior and a reachable consequence caused by the PR.

#### Scenario: The PR breaks a preserved behavior
- **WHEN** the same relevant assertion passes in base and fails in head under comparable conditions
- **THEN** the report identifies a regression candidate for independent confirmation with both observations

#### Scenario: The failure already occurs in base
- **WHEN** the same assertion fails in both revisions under comparable conditions
- **THEN** the comparison does not attribute that observed failure to the PR merely because head also fails

#### Scenario: The head succeeds
- **WHEN** the probe succeeds in head, whether base succeeds or fails
- **THEN** the report states that this probe observed no head failure and does not certify the rest of the PR

#### Scenario: A command cannot exercise the assertion
- **WHEN** execution times out, a dependency is absent, the probe is incompatible, or failure evidence is ambiguous
- **THEN** the result is inconclusive with the cause rather than a confirmed regression

#### Scenario: The behavioral difference is intentional
- **WHEN** the approved intent changes the behavior asserted by the probe
- **THEN** the observed difference alone does not become a blocking regression

### Requirement: Reproduction evidence is bound to the compared inputs

Evidence SHALL identify the review run, compared commits, probe content and command, per-revision execution outcome, bounded diagnostic output and execution limits. The evidence consumer SHALL reject mismatched or modified records. Head changes SHALL invalidate the reproduction. Changes to a compared base or probe SHALL invalidate that comparison without discarding otherwise reusable code-review findings under the existing drift policy.

#### Scenario: Evidence belongs to an earlier PR head
- **WHEN** a comparison record names a different head from the current reviewed identity
- **THEN** it cannot confirm a current finding

#### Scenario: The probe or its result changes after capture
- **WHEN** evidence integrity or the shared probe identity fails validation
- **THEN** the record is rejected and the review discloses unavailable reproduction evidence

### Requirement: Review output distinguishes findings from investigation limits

The existing review SHALL incorporate validated reproductions into the relevant finding once and disclose requested but unavailable or inconclusive investigation in its coverage summary. It SHALL retain code-proven findings when runtime reproduction is unavailable and SHALL NOT interpret unexecuted probes or passing probes as proof that the PR is bug-free. Reproduction SHALL NOT create a separate review, publication authority, mandatory full-suite rerun, or automatic correction loop.

#### Scenario: Reproduction is unavailable but code proves a defect
- **WHEN** the independent verifier confirms causality from code and the reproduction cannot execute
- **THEN** the code-supported finding remains eligible under existing review rules and the execution limitation is visible

#### Scenario: The requested probes find no failure
- **WHEN** completed probes pass and other required review work is complete
- **THEN** the report describes the examined behavior and limits without claiming global correctness
