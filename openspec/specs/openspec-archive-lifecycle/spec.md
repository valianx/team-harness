# openspec-archive-lifecycle Specification

## Purpose
Keep completed and obsolete changes visible until they are archived or reconciled, so `openspec/specs/` reflects accepted behavior.

## Requirements

### Requirement: Archive is assembled with the completed implementation
Claude Code, Codex and OpenCode SHALL use the same lifecycle at authoring, resumption, candidate assembly and close. Once implementation and its relevant checks are complete, Main SHALL prepare authorized archive on the feature branch before the final review package or pipeline Freeze. The same PR SHALL contain implementation, updated living specs and the archived change. An absent or open PR SHALL NOT prevent archive; merge integrates the prepared state. Checked tasks alone SHALL NOT prove implementation or verification. Main SHALL refresh canonical source locations and links after archive, preserve unchanged semantic identity, and bind subsequent review inputs to the archived sources in the candidate. Review corrections SHALL keep code, living specs and the archived record consistent on the same branch, using existing amendment and validation rules. Delivery SHALL publish the accepted candidate unchanged. A later archive SHALL remain a recovery path for work delivered without one.

Main SHALL surface concrete conflicts between affected requirements and relevant active changes, reconciling partial supersession before archive. Approved cancellation or wholesale retirement SHALL use `--skip-specs` without applying discarded deltas or falsely completing tasks. Archive SHALL require authority covering the operation, reusing authority already granted or requesting one brief confirmation. A declined or deferred offer SHALL NOT block close or repeat without a new archive request or material evidence change. Archive SHALL follow repository branch and outward-write conventions and SHALL NOT authorize push, PR creation or merge. Task close, `pipelines` and `trace` SHALL display pending archive with its reason and next action, including direct work without pipeline state; status commands SHALL remain read-only.

#### Scenario: Completed work is prepared for its PR
- **WHEN** implementation and relevant checks are complete and archive is authorized
- **THEN** Main updates living specs and archives the change on that branch before final review, including all three in the same PR

#### Scenario: PR preparation assesses archive readiness
- **WHEN** Main prepares to create or update a PR with related open OpenSpec changes, including direct work outside the OpenSpec lane or pipeline
- **THEN** it compares their requirements and tasks with implementation and verification evidence, validates their structure and delta coherence, and reports each as ready to archive, pending or needing reconciliation with its reason, excluding unrelated changes

#### Scenario: A supported flow prepares and publishes a PR
- **WHEN** direct work, the spec lane, or an explicitly active pipeline reaches PR preparation or publication
- **THEN** Main uses the shared create-pr skill without requiring its explicit invocation, performs content preparation before final review or Freeze, and publishes under the existing authority without changing the accepted candidate or adding another gate

#### Scenario: PR preparation has no relevant OpenSpec change
- **WHEN** a requested PR contains ordinary repository work with no relevant OpenSpec change
- **THEN** Main uses the same create-pr skill without starting OpenSpec, creating pipeline state, or requiring unrelated changes to be archived

#### Scenario: Archive output is verified before publication
- **WHEN** the authorized archive has updated living specs and moved the change
- **THEN** strict validation covers both the archived change and affected living specs before the final candidate is published

#### Scenario: The PR does not exist or remains open
- **WHEN** the completed and checked implementation is ready for archive before publication or while its PR is open
- **THEN** Main prepares archive in that branch without waiting for merge, while reporting delivery as pending integration

#### Scenario: Pipeline validation reads the completed candidate
- **WHEN** authorized archive moves the bound change during assembly
- **THEN** Main refreshes source locations after closing outstanding leases, and Freeze, quality and QA validate the complete committed candidate before delivery

#### Scenario: PR review requires a correction
- **WHEN** a reviewer identifies a defect after the change was archived in the PR branch
- **THEN** Main keeps implementation, living specs and the archived record consistent in that PR and revalidates through the existing flow, applying amendment rules when intent changes

#### Scenario: Work resumes with an archived change
- **WHEN** the bound change is already archived in the candidate branch
- **THEN** Main retains that location and validates its current sources without archiving it again

#### Scenario: The operator declines the archive
- **WHEN** the operator answers no at the archive offer
- **THEN** ordinary review and delivery may proceed without archive, close completes normally, and the pending archive is noted without repeating the declined offer

#### Scenario: A merged change archives inside the next pull request
- **WHEN** the operator accepts the archive of an already-merged change while a later change is being delivered
- **THEN** the recovery archive rides that later PR, whose own completed change can also be archived before its final review

#### Scenario: Accepted local delivery requires no PR
- **WHEN** completed work is verified and accepted under an agreement requiring no PR
- **THEN** Main offers archive using the existing confirmation, without inventing a PR prerequisite

#### Scenario: A PR was merged in another session
- **WHEN** resumed work was validated and merged in another session but remains unarchived
- **THEN** Main offers a recovery archive after checking its requirements against current specs

#### Scenario: A replacement leaves an older change partially obsolete
- **WHEN** changed requirements contradict part of another active change while other requirements remain valid
- **THEN** Main identifies both sources and offers reconciliation before applying or retiring the older change

#### Scenario: An unimplemented change was cancelled
- **WHEN** the operator approves retirement of that change
- **THEN** Main archives without applying its deltas or falsely marking unfinished tasks complete

#### Scenario: Status is requested for completed direct work
- **WHEN** the change has no pipeline workspace
- **THEN** pipelines and trace report its pending archive and missing evidence without creating pipeline state or executing archive

#### Scenario: Implementation or verification is not yet established
- **WHEN** implementation or its relevant checks are incomplete despite checked tasks
- **THEN** Main reports the missing work or evidence and leaves archive pending

#### Scenario: Working evidence accompanies a change
- **WHEN** implementation or review produces raw logs, transcripts, execution notes, or scratch scripts
- **THEN** Main retains them in the configured workspace or permitted temporary storage, preserves maintained tools and tests, and keeps observable requirements in existing living specs without treating execution debris as canonical archive content
