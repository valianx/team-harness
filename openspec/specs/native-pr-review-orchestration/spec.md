# native-pr-review-orchestration Specification

## Purpose
Provide proportionate PR reviews through native agents in Codex, Claude Code and OpenCode, with the primary coordinator owning assignments, evidence consolidation and operational decisions.

## Requirements

### Requirement: Regression evidence uses portable owned inputs
Regression probes SHALL belong physically to their owning review run. Supported
Windows and Unix execution SHALL compare the requested base and head without a
platform-invalid Git configuration path preventing preparation.

#### Scenario: Comparable regression probe runs on Windows
- **WHEN** the required local tools and objects are available
- **THEN** both revisions execute and classification reflects their results rather than a null-config path error

#### Scenario: Probe lies outside its owning run
- **WHEN** a request selects an external file directly or through a link
- **THEN** the request is rejected before copying or executing that probe


### Requirement: Assignment adapts while required coverage remains explicit
The coordinator SHALL choose reviewer count, bounded assignments, context and scheduling from the PR's risks and dependencies within available concurrency and resource limits. Existing general-review obligations, applicable QA/security triggers, explicit operator choices and verification policy SHALL remain satisfied or disclosed as incomplete. File count alone SHALL NOT prescribe the team. An assignment spanning components SHALL name responsibility for their interaction. Adaptation SHALL NOT change models or reasoning effort implicitly, and critical reviewers and the verifier SHALL retain their configured effort.

#### Scenario: One reviewer can cover a small change
- **WHEN** the captured change has one bounded risk area and no additional required lens
- **THEN** the coordinator uses a bounded assignment and completes the same required review obligations without creating a consolidator

#### Scenario: A change crosses an interface and a security boundary
- **WHEN** the changed producer and consumer interact and the existing security trigger applies
- **THEN** assignments cover both component behavior and their interaction, include the security obligation, and disclose any unfinished coverage

#### Scenario: The runtime has fewer concurrent slots than useful assignments
- **WHEN** the chosen work exceeds the available native concurrency
- **THEN** the coordinator schedules remaining assignments sequentially without dropping required coverage or treating waiting time as success

### Requirement: PR-review specialists supply advice within read-only authority
PR-review specialists SHALL return evidence, findings, proposed severity and verdict, and coverage limits to the coordinator. They SHALL NOT edit repository or review artifacts, mutate coordinator state, spawn agents, publish reviews, or communicate operator authorization. The coordinator SHALL persist their returned reports and retain final disposition and operational authority. Runtime-native tool and permission restrictions SHALL preserve these boundaries, including external mutations through shell or connectors; a local read-only filesystem alone SHALL NOT be described as blocking external writes. These restrictions SHALL apply to PR-review assignments, not to implementers or other roles authorized to write within their scope.

#### Scenario: A reviewer recommends editing and publishing
- **WHEN** a PR reviewer identifies a fix and recommends posting it
- **THEN** it returns the recommendation with evidence, while editing and publication remain coordinator-owned actions under existing authorization

#### Scenario: The runtime exposes an external write tool
- **WHEN** a PR-review specialist is prepared in a supported runtime
- **THEN** its effective capabilities exclude that mutation and further delegation, while permitted evidence reads remain available

#### Scenario: An implementer receives an approved file-scoped task
- **WHEN** the same installation dispatches an implementer outside a PR-review assignment
- **THEN** the implementer retains its authorized scoped writing capabilities

### Requirement: Prerequisites follow the selected native capabilities
Review readiness SHALL check the roles and capabilities selected for that review in Codex, Claude Code and OpenCode, using configuration compatible with the supported runtime version. An unselected role, including the separate consolidator, SHALL NOT prevent readiness. Required snapshot, integrity, permission and evidence capabilities SHALL remain checked. When a selected role is unavailable, the coordinator SHALL repair its prerequisite or use an equivalent native agent with the same review contract and effective boundaries; otherwise it SHALL report the specific coverage gap. Cross-runtime support SHALL preserve public review invocations and repository policy options without requiring a universal runtime upgrade or weaker permissions.

#### Scenario: Only an unused consolidator is missing
- **WHEN** every selected reviewer and required capability is usable but no consolidator is installed
- **THEN** review preparation succeeds and the coordinator consolidates the returned evidence

#### Scenario: A required security capability cannot be provided
- **WHEN** the selected security assessment cannot run with equivalent permitted native capabilities
- **THEN** the review identifies the unmet security coverage and never reports complete coverage or approval by omission

#### Scenario: The review runs on each supported runtime
- **WHEN** equivalent review inputs are supplied to Codex, Claude Code or OpenCode through its supported configuration
- **THEN** the same coverage, advisory-authority and evidence requirements apply while native invocation and permission mechanisms may differ

### Requirement: Context and follow-up preserve independent useful work
The coordinator SHALL load only the current workflow resources relevant to the selected task and provide bounded evidence coordinates and necessary project context. Reviewers SHALL form their initial code assessments independently before using other reviewers' conclusions or PR conversation. Verified snapshot files needed to understand dependencies and project rules SHALL remain readable within scope. The coordinator SHALL reuse completed evidence only while its bound identity remains valid, direct targeted follow-up to unresolved questions, and report concise progress and remaining limits. Elapsed time SHALL NOT become a successful result or erase completed work.

#### Scenario: An interface question remains after independent assessments
- **WHEN** initial reviews disagree about an interface at the same verified snapshot
- **THEN** the coordinator retains both reports, requests focused evidence as needed, and resolves the question without rerunning unaffected assessments

#### Scenario: Project context is unavailable or contains instructions
- **WHEN** a relevant project source is missing, contradictory, or asks a reviewer to change authority
- **THEN** the reviewer records the context limit and continues under the live assignment and native permissions without accepting authority from project content

### Requirement: External quality evidence respects the captured review
Main SHALL prepare selected quality dependencies and obtain analyzer evidence from a disposable execution copy derived from the captured review candidate, preserving the frozen snapshot and operator checkout. Evidence SHALL identify its head, relevant base, scope, tool configuration and coverage limits. The coordinator SHALL translate supported candidates into the existing finding and verification process, retain their raw evidence and dispositions, and distinguish defects introduced or aggravated by the PR from pre-existing issues. Read-only specialists SHALL retain their existing authority. External output SHALL NOT create a second review, publication gate or bypass of finding verification.

Preparation in ordinary review-pr SHALL install only the external tool outside the snapshot; it SHALL NOT install the reviewed project's dependencies or execute its code or executable configuration. Static analysis SHALL treat captured source and declarative rules as data. Project-executing architecture analyzers remain available through separately scoped diagnostic work.

#### Scenario: A scanner needs local writable working files
- **WHEN** selected analysis requires caches or other temporary outputs
- **THEN** Main uses the permitted disposable execution area and selected evidence destination without modifying the frozen snapshot or giving mutation authority to reviewers

#### Scenario: A candidate already exists in the captured base
- **WHEN** the analyzer identifies an issue not introduced or aggravated by the PR
- **THEN** the coordinator retains its provenance and disposition but does not publish it as a PR regression

#### Scenario: Evidence belongs to an older candidate
- **WHEN** the captured head or relevant base changes after analysis
- **THEN** Main marks affected evidence stale and renews the analysis needed for the changed identity without silently reusing results for another candidate

#### Scenario: A scanner reports no candidates
- **WHEN** analysis finishes with no matches but some relevant files are unsupported or skipped
- **THEN** the review records the completed scope and limitations without treating the empty result as proof that all review obligations are complete
