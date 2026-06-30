### Fixed
- Added the canonical `## Untrusted content & prompt-injection floor` section (mirroring `agents/researcher.md`) to `agents/delivery.md`, `agents/implementer.md`, `agents/tester.md`, `agents/qa.md`, `agents/reviewer-consolidator.md`, `agents/research-consolidator.md`, and `agents/documenter.md`. These agents all ingest external content (GitHub issues, PRs, web pages, or user-supplied documents) and were missing the prompt-level injection defense.
- `agents/code-researcher.md` already contained a custom-tailored equivalent floor (added previously) and was left unchanged.
