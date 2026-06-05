### Fixed

- The configured `language` default was not honored across turns in a session — the agent drifted to the operator's per-message language because a single SessionStart injection lacked recency parity against repeated per-message signals. A new `UserPromptSubmit` hook (`hooks/language-user-prompt.sh`) now re-asserts the configured language directive adjacent to every operator message, restoring consistent language behavior regardless of per-message input language. Fixes #268.
