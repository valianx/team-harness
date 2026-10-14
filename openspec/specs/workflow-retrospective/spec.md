# workflow-retrospective Specification

## Purpose
Assess a completed effort against its requested outcome using retained artifacts, with attributable conclusions, practical improvements and explicit limits instead of rerunning the effort.

## Requirements

### Requirement: Retrospective routing preserves scenario evaluation
TH SHALL select retrospective assessment through `eval --retrospective [workspace-path]` or an unambiguous request to evaluate a completed effort. It SHALL resolve the existing target and accepted scope from supplied paths or context before scenario execution, requesting only material missing identity. Existing scenario, list, create, dry-run, spec, repetition and baseline modes SHALL retain their meanings. Retrospective selection SHALL reject incompatible scenario/execution arguments without falling through to agent invocation. Retrospective dry-run SHALL preview the target, evidence and assessment without writing a result.

#### Scenario: The operator names an existing audit effort
- **WHEN** eval is asked to assess the completed audit in a known workspace
- **THEN** it selects retrospective assessment and reads that effort's artifacts without interpreting the audit name as an agent or running the audit again

#### Scenario: A retrospective request contains a trial flag
- **WHEN** `--retrospective` is combined with `--k` or another incompatible execution selector
- **THEN** eval identifies the conflict and performs no evaluated-agent invocation or benchmark

#### Scenario: Existing authored scenarios are requested
- **WHEN** the operator selects an existing scenario or spec/pass-bar mode without retrospective intent
- **THEN** that mode and its existing argument/report semantics remain available under native authorization

### Requirement: Assessment preserves historical scope and evidence identity
The assessment SHALL compare the original requested outcome and accepted scope changes with attributable artifacts, source/configuration/environment identities and actual results. It SHALL preserve historical review snapshots and findings separately from later corrections. Missing, inaccessible, contradictory or uncollected evidence SHALL remain specifically unverified; absent findings or logs SHALL NOT establish correctness. It SHALL use available scoped reports/events without claiming unavailable transcript access or searching unrelated efforts.

#### Scenario: A later correction follows an earlier review
- **WHEN** the effort records review at one commit and a targeted correction with checks at another
- **THEN** the assessment retains those distinct identities and does not describe the later commit as independently re-reviewed

### Requirement: Retrospective evaluates factual workflow outcomes
The assessment SHALL examine coverage, claim fidelity, duplicate work, consolidation, delivery and omissions against the accepted intent. It SHALL connect material observations to evidence and distinguish supported gaps from uncertainty. Reuse and duplicate-work conclusions SHALL account for the question and relevant changed inputs; useful independence SHALL NOT be treated as waste. Consolidation SHALL retain causal IDs and linked occurrences/status upgrades. Requested delivery SHALL be compared with actual grouping, content, object/action, location and access evidence; file sharing SHALL NOT imply folder access. Existing hookify evidence/friction guidance SHALL support relevant recommendations.

#### Scenario: Two reports describe one confirmed cause
- **WHEN** retained lens reports and a later status upgrade refer to the same causal defect
- **THEN** the assessment distinguishes useful corroboration from inflated finding counts and evaluates consolidation using the cause and its linked evidence

#### Scenario: A changed configuration explains a repeated check
- **WHEN** a repeated command addresses a changed relevant configuration
- **THEN** the assessment accounts for that change before attributing duplication or avoidable work

#### Scenario: Files were uploaded but requested folder access is absent
- **WHEN** delivery artifacts prove document upload and file sharing without evidence of requested folder permissions
- **THEN** the assessment records verified delivery scope and leaves folder access unverified rather than passed

### Requirement: Retrospective does not resume or benchmark the effort
Main SHALL perform the retrospective directly from existing artifacts. Selecting it SHALL NOT invoke evaluated agents, resume workflows, generate scenarios or baselines, rerun audits/tests/measurements, install providers, change product/configuration, apply recommendations or perform outward writes. New verification or implementation SHALL remain a separately requested action under native permissions; the report SHALL identify the smallest missing observation rather than silently obtaining it through a new run.

#### Scenario: Evidence is insufficient to confirm a claimed integration result
- **WHEN** only an isolated fixture is retained and real integration evidence is absent
- **THEN** eval reports that boundary and the missing observation without running integration, an agent or a new audit

### Requirement: Retrospective returns one attributable report
TH SHALL preserve the requested report form and destination, defaulting to one `reviews/00-retrospective.md` in the existing workspace. The result SHALL identify target/intent, assessed evidence and limits, supported outcomes and gaps across the six dimensions, and prioritized recommendations with dependencies/tradeoffs and verifiable closure observations. It SHALL reuse useful evidence links and avoid parallel authoritative workflow state. Counts, time, native usage, cost or savings SHALL require actual attributable measurements; missing denominators SHALL remain unknown. The retrospective SHALL NOT fabricate an overall score, certification or model-run result.

#### Scenario: Artifacts lack usage and complete execution counts
- **WHEN** the available reports contain partial command evidence but no complete denominator, native usage or billing inputs
- **THEN** the report retains the partial outcomes and unknown quantities without inventing percentages, costs, savings or a benchmark score
