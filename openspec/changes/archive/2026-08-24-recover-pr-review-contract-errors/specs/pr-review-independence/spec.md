## ADDED Requirements

### Requirement: Reviewer path mistakes recover without weakening snapshot safety
Reviewer agents SHALL read only coordinator-supplied artifacts and project leaves proven to exist inside the frozen worktree before content access. Instruction-source markers, semantic-source markers, conventional filenames, unresolved imports, and optional coordinates set to `none` SHALL NOT be opened as project context. A nonexistent path outside the supplied and verified set SHALL be classified as an agent path-scope mistake rather than a filesystem transport failure.

The same coordinator-owned correction SHALL apply to mechanically detectable reviewer contract defects, including claiming that a supplied coordinate is missing, omitting required return fields, selecting an unauthorized persistence path, rejecting the runtime's declared read transport, or reading an unverified inferred path. The coordinator SHALL rebuild the packet from captured coordinates, identify the violated rule, and retry once on the same immutable snapshot without an operator decision or gate. Contract correction SHALL NOT authorize snapshot rebuild, identity substitution, finding fabrication, or publication.

The recovery classification SHALL be executable and deterministic. It SHALL validate every required dispatch artifact and required directory, the frozen worktree, the exact failed path when available, the contract signal, the returned snapshot identity, snapshot integrity and freshness, reviewer role, and attempt number. It SHALL emit only `retry-contract`, `continue-comment`, or `fail-closed`; an incomplete or malformed classification SHALL fail closed.

After snapshot-integrity and freshness checks pass, a first mechanically detectable contract defect SHALL produce `retry-contract`. A repeated specialist-only contract defect SHALL produce `continue-comment`, mark that lens `absent after retry (agent contract)`, and force a `COMMENT` recommendation while allowing successful lenses to complete. A repeated general-review or consolidation defect that leaves no trustworthy canonical draft SHALL fail closed.

A missing or mismatched snapshot identity, freshness or integrity failure, unreadable required supplied artifact, unreadable frozen worktree, unreadable verified-existing project leaf, path outside the permitted review roots, or otherwise unclassifiable failure SHALL fail closed. Recovery SHALL preserve the existing preview, operator publish approval, approved-draft hash, and publish-time freshness requirements.

#### Scenario: Security reviewer infers an absent project path
- **WHEN** the security reviewer attempts to read a nonexistent project path that the coordinator did not supply and the frozen worktree did not verify
- **THEN** the coordinator preserves the immutable snapshot, automatically retries once with that path forbidden, and does not ask the operator to repair filesystem access

#### Scenario: Reviewer omits a supplied identity echo
- **WHEN** a reviewer receives the reviewed SHA and context hash but omits one from its return while the snapshot remains identical and fresh
- **THEN** the coordinator automatically reissues a corrected packet on the same snapshot without an operator decision

#### Scenario: Specialist repeats a contract defect
- **WHEN** a specialist repeats a mechanically detectable contract defect after its automatic retry
- **THEN** the coordinator marks the lens absent, continues with successful lenses, forces `COMMENT`, and retains the normal publication approval gate

#### Scenario: Canonical reviewer repeats a contract defect
- **WHEN** the general reviewer or consolidator repeats a contract defect and no trustworthy canonical draft remains
- **THEN** the coordinator fails closed without fabricating findings or publishing a review

#### Scenario: Required captured diff is unreadable
- **WHEN** the coordinator-supplied diff cannot actually be read
- **THEN** the review fails closed without previewing, approving, or publishing a draft

#### Scenario: Snapshot identity or freshness fails
- **WHEN** the returned snapshot identity differs or snapshot integrity or freshness no longer matches
- **THEN** the review fails closed and the coordinator does not relabel the failure as an agent contract defect
