---
name: apply-review
description: Apply reviewer comments on a PR using the conservative author-side disposition.
---

Analyze the input: $ARGUMENTS

---
name: apply-review

## Mode 1 — PR reference provided (`#123`, `123`, or a PR URL)

1. Extract the PR number/reference from the input.
2. Pass to the `lider` agent:
   ```
   Direct Mode Task:
   - Mode: apply-review
   - PR: {pr-reference}
   ```

## Mode 2 — No input provided

Ask the user: "Which PR's review comments do you want to apply? Give a PR number (#123) or URL."

---
name: apply-review

## Important

- Always invoke the `lider` agent — do NOT invoke agents directly.
- This is a thin entry point. The conservative author-side disposition lives in
  `agents/_shared/apply-review-disposition.md`; this skill does NOT restate it.
- This direct mode is a COMPLEMENT to the orquestador's automatic, lifecycle-bound
  apply-review handling — it does not replace it. The automatic trigger still fires
  when the orquestador works a PR that carries reviewer comments.
- The lider pulls the PR's comments (gh / gh-fallback) and applies the full
  disposition (classify → verification filter → deletion discipline → resolve-don't-obey
  → per-comment output) to each comment — the same behavior as the automatic path.
