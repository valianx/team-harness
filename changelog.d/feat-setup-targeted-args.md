### Added

- `/th:setup <intent>` natural-language argument routing: routes directly to one configuration concern (memory, context7, workspace/logs, language, english-learning, clickup, obsidian-tasks, python/deps) using bilingual ES/EN cues; no-argument invocation is unchanged and walks the full flow including the Step 0 staleness guard; targeted runs skip Step 0 and run Step 6 MCP verification only for MCP targets; no-match arguments print the list of routable concerns and ask the operator to name one (no write).
