## ADDED Requirements

### Requirement: Blocking findings are verified against the frozen worktree before preview
After the canonical draft exists and before Preview, the coordinator SHALL dispatch one read-only `pr-review-verifier` with the inline findings, the captured diff, the frozen worktree, and the reviewed identity. For each Blocking finding the verifier SHALL return `confirmed` with a `file:line` citation and one sentence of evidence, or `unconfirmed` with the reason, and SHALL echo the reviewed identity. An unconfirmed Blocking SHALL be demoted to a Suggestion whose body begins with `(unverified)`. A Blocking whose cited behavior does not exist at the reviewed identity SHALL be dropped and recorded in the disposition ledger as `dropped: verifier — <reason>`. Verification SHALL NOT add findings. The coordinator SHALL append `verified k/n` to the `Lenses:` line; an absent verifier SHALL appear as `verified 0/n (verifier absent)` and force `COMMENT`.

#### Scenario: A blocker cites behavior the code does not have
- **WHEN** the verifier finds that the cited path and line at the reviewed identity do not exhibit the claimed defect
- **THEN** the finding is dropped, the ledger records the verifier's reason, and the preview shows the remaining findings with `verified` counted on the coverage line

#### Scenario: The verifier cannot confirm a blocker
- **WHEN** the verifier returns `unconfirmed` for a Blocking finding
- **THEN** the finding is published as a Suggestion prefixed `(unverified)` and counted as unverified on the coverage line

#### Scenario: The verifier does not return
- **WHEN** the verifier dispatch produces no valid return
- **THEN** the coverage line reads `verified 0/n (verifier absent)`, the recommendation is `COMMENT`, and the normal preview and approval flow continues

### Requirement: The review policy sets the verification bar
`.team-harness/review-policy.md` MAY carry a fenced `yaml` block with `verification: blocking-only | all | off` and `max_suggestions: <n>`. Defaults SHALL be `blocking-only` and `5`. `all` SHALL verify Suggestions as well; `off` SHALL skip the verifier and SHALL print `verification off (policy)` on the coverage line.

#### Scenario: A repository turns verification off
- **WHEN** the policy declares `verification: off`
- **THEN** no verifier is dispatched and the published `Lenses:` line states `verification off (policy)`

### Requirement: The review skill fits the skill budget
`skills/review-pr/SKILL.md` SHALL be under 500 lines. Mechanical steps that do not describe the operator-facing flow SHALL live in named `review_context.py` subcommands.

#### Scenario: Lint measures the skill
- **WHEN** `/th:lint` measures `skills/review-pr/SKILL.md`
- **THEN** the line count is under 500 or the check fails naming the file

### Requirement: Reviewers read only supplied coordinates and verified worktree leaves
Reviewer agents SHALL read only coordinator-supplied artifacts and project leaves proven before content access to be existing, non-symlink regular files whose resolved paths remain inside the frozen worktree. A deleted changed-file path SHALL NOT authorize a head-worktree read; reviewers SHALL obtain deleted-file evidence from the captured diff. Instruction-source markers, semantic-source markers, conventional filenames, unresolved imports, and optional coordinates set to `none` SHALL NOT be opened as project context.

A reviewer return that omits a required field, echoes an identity different from the dispatched one, or reports a supplied artifact as unreadable SHALL be recorded as `absent ({reason})` on the coverage line and SHALL force a `COMMENT` recommendation. The coordinator SHALL NOT rebuild the packet, classify the mistake, or dispatch a correction. A missing or mismatched snapshot identity, an integrity or freshness failure, or an unreadable frozen worktree SHALL fail closed as before. Preview, live publish approval, approved-draft hash, and publish-time freshness are unchanged.

#### Scenario: A reviewer infers an absent project path
- **WHEN** a reviewer attempts to read a path the coordinator did not supply and the frozen worktree does not contain
- **THEN** the read is skipped as an absent optional path and the review continues on the supplied coordinates

#### Scenario: A reviewer omits its identity echo
- **WHEN** a lens return lacks the reviewed SHA or context hash
- **THEN** the lens is recorded `absent (missing identity echo)`, successful lenses complete, and the recommendation is `COMMENT`

#### Scenario: Snapshot identity or freshness fails
- **WHEN** the returned identity differs or snapshot integrity or freshness no longer matches
- **THEN** the review fails closed without preview or publication

## REMOVED Requirements

### Requirement: Reviewer path mistakes recover without weakening snapshot safety
**Reason**: Coordinator-owned classification and retry of the harness's own reviewers is contract weight that protects no asset the read-only sandbox and the identity checks do not already protect. The path boundary it carried survives in "Reviewers read only supplied coordinates and verified worktree leaves"; the repair path does not.

**Migration**: `classify-agent-failure` is removed from `review_context.py`. A reviewer return that breaks its contract is recorded `absent ({reason})` and forces `COMMENT`; identity, integrity, and freshness failures still fail closed.
