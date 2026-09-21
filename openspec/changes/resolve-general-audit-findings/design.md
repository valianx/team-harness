## Context

The general diagnostic reports are retained in the existing Obsidian workspace.
They establish bounded failures, not authority to redesign the harness. The
operator authorizes correcting them together in PR677.

## Decisions

- Repair existing consumers and validation boundaries in place. Reuse native
  runtime execution/permissions; do not add a policy engine or universal gate.
- Use physical ancestor resolution for workspace/probe ownership and normalize
  Git's repository-selection environment at existing helper entry points.
- Validate review identity independently of cached labels. Keep unchanged valid
  captures reusable and report malformed inputs with an actionable result.
- Recognize package-manager mutation syntax only at the quality declaration
  boundary; project scripts remain trusted execution under native permissions.
- Keep OpenCode context in its already-registered native guide, which reads
  runtime preferences. Remove disconnected adapter code/tests rather than
  reintroducing an unused plugin protocol. Preserve shared Claude context code.
- Keep canonical visual instructions runtime-neutral and delegate destinations
  to workspace. Simplify gcp-costs routing to the current coordinator.
- Remove orphan installer selectors/migration readers only after consumer
  searches; retain active projection rules, configuration builders and guides.

## Validation and risks

Use existing executable tests with negative and positive controls, Windows
junction/path cases and native Go dependency cases. Review prose scenarios
directly; do not add tests that freeze instruction wording. Run TEA test-design,
test-review and trace, Superpowers completion verification, OpenSpec verify and
independent review. Regenerate distributed mirrors once ownership edits converge.

A removed adapter may have historical users outside supported installation:
document its native-guide replacement without deleting unknown installed files.
Configuration and unrelated user work remain intact. No provider update or
additional version bump is required for this amendment in the same unreleased PR.
