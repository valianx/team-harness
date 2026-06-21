### Fixed

- `apply --runtime opencode` no longer causes opencode to reject placed agent `.md` files at startup. The Go installer transform now maps CC color names to opencode named enums (`green→success`, `red→error`, `yellow/orange→warning`, `cyan/blue/teal→info`, `purple/magenta/pink→accent`) instead of passing them through, and converts the `permission` field from an invalid array form (`{allow: [PascalCase tools]}`) to a valid `PermissionRuleConfig` flow-mapping object (`{lowercase-key: allow}`) with MCP tools silently dropped.
