### Fixed
- Structural suite: model-pin assertions for `acceptance-checker`, `translator` (suite92) and `adversary` (s125/AC-15b) updated to the sonnet re-tier shipped in PR #475 — main CI was red because the tests still encoded the pre-re-tier allocation.
- CLAUDE.md trimmed below the 36 KB durable-headroom guard (36163 → 35912 bytes) by offloading the no-default-Memory-MCP-URL rationale to `docs/knowledge.md`.
