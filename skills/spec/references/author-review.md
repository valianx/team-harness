# Optional author review

When the implementation is ready to prepare its PR, offer one concise choice in the operator's
language, after classifying the candidate: review it with agents, or skip the optional review and continue
publication. State the proposed lenses (`tester`, `qa`, `security`) and that results stay in
chat and the configured workspace. An existing live acceptance or refusal for this delivery
settles the choice; do not ask again per repository. Silence is not acceptance or refusal.
While the choice is pending, continue independent preparation but hold PR publication.
Mandatory security-floor choices and checks
still apply when optional review is declined; record the optional review as skipped, not passed.

Acceptance authorizes this local review and ordinary fixes within the approved scope. It does
not authorize GitHub review/comment publication, merge, deployment, or a broader specification.
This offer targets the author's committed candidate before publication. A separate request to
review an existing PR by number or URL still uses `review-pr` and its own approval contract.

## Review and report

Use `../../verify/SKILL.md` and its canonical inline-review contract to package each repository's
clean committed range with its validated OpenSpec change and the accepted lens set. Record exact base/head and prerequisite
references. Reuse an already accepted review for the same candidate; multiple lenses form one
review. Dispatch one native read-only `inline-reviewer` per required lens, adding `adversary`
when required by the security floor. Preserve all profile, immutable-target and currentness
checks. An unavailable or failed lens is not a pass; report the precise limitation. If the package
proves the whole surface checker-verified, report that evidence without dispatching empty work.

Collect all returns and run `review-fan.mjs gate`. Main consolidates duplicate findings and checks
their supporting evidence against the anchored candidate before changing code. Preserve unresolved
disagreements and coverage limits. Reviewers do not edit files or publish anything. Main writes
`reviews/pre-pr-review.md` in the existing common workspace and links it from `01-plan.md`.
In Obsidian mode both remain there, without a repository-local duplicate.

An accepted review holds publication until every required lens completes and `gate` resolves
`ready`. Failed, unavailable, stale or unresolved returns never count as a pass. The existing
`fully_verified: true` checker-only path avoids empty dispatch; report its checker evidence
and retain any applicable security hold. An explicit refusal skips only the optional review.

The report names each repository and reviewed base/head, lens outcomes, coverage/limitations,
findings with severity and file/line evidence, and their dispositions. Show the concise result in
chat before starting repairs. Keep the original findings and append closure evidence and corrected
commit references; never relabel a newer commit as reviewed by agents that inspected the old one.

## Repair

Fix confirmed in-scope defects directly, including useful nonblocking corrections; record why a
finding is rejected or deferred instead of mechanically accepting every suggestion. For a blocker
covered by written intent, execute its scenario and relevant deterministic suites to close it.
Before amending or reopening a spec, tell the operator which finding requires it, why a code-only
fix is insufficient, and what intent, criteria or plan steps will change. Record that explanation
and the revised status in the common plan; never silently reopen a spec.
If the repair changes intended behavior, acceptance or authority, amend or reopen the appropriate
repository's spec, validate it and obtain only any missing scope approval. Reuse a live instruction
already authorizing that revision. Reopening an archived change uses the upstream OpenSpec flow
and preserves history. Neither a reviewer finding nor the workspace report grants scope authority.

Repair dependencies first and then consumers, updating canonical tasks and the common plan.
Preserve original lens verdicts: deterministic closure does not manufacture a new reviewer pass
or make `gate` ready on unchanged failing returns. Keep any applicable security hold visible.
Record remaining concerns, test results and final commit references in the review report before
resuming authorized publication. An unresolved blocker holds the affected PR; missing evidence
stays explicit. Do not automatically dispatch another full review after fixes. Use finding-specific
checks for closure; a reviewed delta requires a new live request and the prior review anchor.
No step here writes a review or comment to GitHub.
