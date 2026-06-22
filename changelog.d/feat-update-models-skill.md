### Added
- `/th:update-models` skill: resolves the latest concrete Anthropic model id per tier (opus/sonnet/haiku) from models.dev at run time and refreshes `model:` lines in the operator's opencode agent files; confirmation gate, single rolling backup, fallback-to-no-change on resolver failure.
