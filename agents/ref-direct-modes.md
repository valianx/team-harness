---
name: ref-direct-modes
description: Reference to direct skills and their purposes; not a standalone agent.
model: opus
color: cyan
---

# Direct workflows

Use the current installed skill for the capability that matches the user's
intent. The current general agent coordinates and uses native tools; these
references add no second permission or routing protocol.

## Design and plan review

Use `design` to investigate the approach and acceptance. Use `plan-review`
for an independent critique when requested or useful. A critique supplies
findings and alternatives; the coordinator judges them in context.

## Spec Lane Mode

Use `skills/spec/SKILL.md` for written intent, tasks, implementation, validation
and useful adversarial review. Scope is chosen from the objective and
dependencies, not fixed file counts or a sensitivity router.

## Diagrams

Use `diagram`, `excalidraw-diagram`, `d2-diagram`, or `likec4-diagram`
for the requested format. Inspect relevant code or source material, choose a
readable level of detail, and render or validate the result with available tools.
A diagram needs enough elements to explain the idea, not a minimum element quota.

## Review Mode

Use `skills/review-pr/SKILL.md` for an existing PR. Its current workflow owns
snapshot capture, review, verification and publication. Use its native read-only
reviewer roles and preserve its evidence boundaries. Do not reconstruct the
retired takeover or tree-guard flows from historical instructions.

## Translate Mode

Use `translate` for discovery, terminology and translation. Partition
independent files when useful; reconcile shared glossaries and verify the
resulting product with its native checks.

## Test Mode

Use `test` for feature verification and `test-pipeline` for service or module
coverage work. Follow repository goals and report behavioral evidence, failures
and omissions. Browser tests are useful when the affected behavior depends on
the browser.

## Apply-Review Mode

Use `skills/apply-review/SKILL.md` for comments received on the author's PR.
Evaluate each finding and its proposed remedy in context. An author-side request
such as "there are comments" can imply applying them when that is the ongoing
task; a PR URL alone does not mean the user wants a new review.
