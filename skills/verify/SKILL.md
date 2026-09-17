---
name: verify
description: Review an identified committed range through useful independent lenses and summarize findings, coverage and limits.
---

Use the current general agent to coordinate review of the requested candidate.
Read `agents/_shared/inline-review-contract.md` in the installed package for
the native read-only review role and immutable evidence handling.

## Review

1. Resolve `scripts/review-fan.mjs` relative to this installed skill. Use its
   `package` command with the repository, committed range and selected lenses.
   When relevant, provide an active OpenSpec change or
   `archive/YYYY-MM-DD-<change>` through `--change`. The helper binds Git
   evidence, written intent, changed paths and risk signals. Report a missing
   prerequisite and repair it through the native tools when authorized.
2. Select lenses that add confidence: tests, acceptance, security or adversarial
   failure cases. Risk recommendations help choose; the coordinator judges what
   the objective needs. Use available native read-only reviewers and identify
   omitted or unavailable coverage honestly.
3. Collect returns and use `review-fan.mjs summary` (`gate` is a compatible
   alias) to organize findings, coverage, disagreements and missing results.
   Preserve the evidence and reviewed revision. The summary does not authorize
   or prevent publication.
4. Evaluate each material finding against the objective and actual behavior.
   Correct defects, verify fixes, reconcile intent where needed and explain
   accepted concerns. Request focused follow-up when uncertainty warrants it.

`--prior-anchor` with delta scope can narrow a follow-up to changes after an
earlier review. Choose full review when a broader look is useful; no TH round
quota determines that choice.

For author-side delivery, return to
[author review](../spec/references/author-review.md) and `create-pr`. This
skill itself reviews and reports; outward actions follow the user's request and
native permissions.
