## Approach

Main interprets existing runner evidence for only the selected checks. Exit status remains process evidence; the semantic acceptance claim must state what actually ran. Reviewers declare unavailable execution evidence rather than pretending source inspection ran tests.

Default adapter, service and API tests use in-memory port fakes or mocks. Separately marked real-service checks require explicit selection; when acceptance depends on that boundary, run them or state the gap rather than accepting a silent default-suite skip.

## Compatibility

Mandatory full suites, test-count quotas, infrastructure installation, blanket mocking, new agents or gates. Existing native permissions and accepted direct-mode authority remain in effect.

## Validation

Use the scenarios in the delta and the existing relevant checks. Instruction-only changes receive behavioral inspection, not tests pinned to prose.
