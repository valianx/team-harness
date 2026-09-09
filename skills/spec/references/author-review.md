# Optional author review

When the implementation is ready to prepare its PR, offer one concise choice in the operator's
language, after classifying the candidate: review it with agents, or skip the optional review and continue
publication. State the proposed lenses (`tester`, `qa`, `security`) and that results stay in
chat and the configured workspace. An existing live acceptance or refusal for this delivery
settles the choice; do not ask again per repository. Silence is not acceptance or refusal.
While the choice is pending, continue independent preparation but hold PR publication. Mandatory
security-floor choices and checks still apply when optional review is declined; record the optional
review as skipped, not passed.

Acceptance authorizes this local review and ordinary fixes within the approved scope. It does
not authorize GitHub review/comment publication, merge, deployment, or a broader specification.
This offer targets the author's committed candidate before publication. A separate request to
review an existing PR by number or URL still uses `review-pr` and its own approval contract.

## Review and report

Use `../../verify/SKILL.md` and its canonical inline-review contract to package each repository's clean committed range with its validated OpenSpec change and accepted lens set. Record exact
base/head and prerequisite references. Reuse an accepted review for the same candidate; multiple lenses form one review. Dispatch one native read-only `inline-reviewer` per required lens, adding
`adversary` when required by the security floor. Preserve profile, immutable-target and currentness checks. An unavailable or failed lens is not a pass; report the precise limitation. If the package
proves the whole surface checker-verified, report that evidence without dispatching empty work.

Collect all returns and run `review-fan.mjs gate`. Main consolidates duplicate findings and checks their supporting evidence against the anchored candidate before changing code. Preserve unresolved
disagreements and coverage limits. Reviewers do not edit files or publish anything. Main writes
`reviews/pre-pr-review.md` in the existing common workspace and links it from `01-plan.md`; in Obsidian mode both remain there, without a repository-local duplicate.

An accepted review with dispatched lenses requires complete, trusted, correctly anchored returns
for every required lens. Failed or unavailable execution, malformed or stale-at-review or
stale-at-consolidation returns, incomplete coverage, unresolved blocking disagreement and
validation failure never become review success through patches. The `fully_verified: true`
checker-only path reports checker evidence without empty dispatch; retain security holds. Explicit
refusal skips only the optional review.

Publication can proceed when the original immutable gate resolves `ready`, or the coordinator closes
all actual blockers after complete, trusted, correctly anchored returns, even if a lens returned
concerns or fail. A non-pass unexplained by closed findings or residual nonblocking concerns, or
caused by missing coverage, still holds publication. A scoped repair advancing the head does not
make the original review stale. Bind `reviewed_head` and `corrected_head`, inspect their entire
diff, and hold publication if it contains unrelated changes; only verified repairs and authorized
spec amendments are in scope. Record each finding's disposition and, when fixed or closed, its
targeted written-intent criterion or regression check plus relevant suite evidence at
`corrected_head`. Residual nonblocking concerns may remain in the PR. This coordinator decision is
separate from `gate` and is not a mechanical requirement of `gh pr create`.

When the security floor applies, `security` and `adversary` remain mandatory: their returns must be
complete, trusted and correctly anchored, with evidence-backed closure for all actual blockers. A
resolved security finding needs no fresh pass solely because its old verdict says concerns or fail;
failed, unavailable, malformed, stale-at-review or stale-at-consolidation, incomplete or disputed
coverage still holds publication.

The report names each repository and reviewed base/head, lens outcomes, coverage/limitations, findings with severity and file/line evidence, and their dispositions. Show the concise result in
chat before repairs. Keep original findings and append closure evidence and corrected commit references; never relabel a newer commit as reviewed by agents that inspected the old one.

## Optional fix evidence

For a bounded fix, Main may run the same assertion or probe against the exact base
and candidate revisions using native execution in disposable isolated copies.
Keep the operator's checkout intact. Select a safe probe, explicit input, bounded
output and a process timeout before executing either revision; this adds no runner,
dependency installation, specialist dispatch or universal acceptance gate.
The assertion must be runnable at both revisions: use an existing test or supply
the same reproducible external probe to both copies. A test missing at base is
inconclusive, not a failure caused by the bug.

Record both revisions, the identical probe/command and assertion, relevant environment,
exit/result and bounded diagnostics in the existing plan or review report. Only
base FAIL caused by the target bug followed by candidate PASS supports a demonstrated
fix. Both PASS means no reproduction; both FAIL means no demonstrated fix.
Infrastructure errors, unrelated failures or unrelated timeouts are inconclusive.
A timeout is target evidence only when the probe specifically reproduces that hang.

The PR `regression-evidence.mjs` helper classifies base PASS / head FAIL as a possible
introduced regression; head PASS alone does not demonstrate a fix. Do not fabricate
its required PR context or owner token to use it as a standalone fix verifier.

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
Preserve original lens verdicts and gate output: deterministic closure does not manufacture a
reviewer pass or rewrite `gate` to `ready` on unchanged returns; it can support the coordinator
closure decision above when the review was complete and trusted. Record concerns, per-finding
dispositions, targeted checks, suite results and final commit references before resuming authorized
publication. An unresolved blocker or missing evidence holds the affected PR. Do not automatically
dispatch another full review after fixes. Use finding-specific checks for closure; a reviewed delta
requires a new live request and the prior review anchor. No step here writes a review or comment to
GitHub.
