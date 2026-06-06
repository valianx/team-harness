### Fixed

- `skills/setup/SKILL.md`: added version-staleness guard (Step 0) that refreshes the marketplace catalog, compares installed vs latest `th` version, and warns the operator if running on a stale plugin before any configuration — advisory only, never hard-blocks. Mirrors `/th:update` Steps 1–4 (#272).
