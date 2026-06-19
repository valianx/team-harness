### Added

- `--runtime opencode` flag for the Go installer (`go run ./cmd/install plan|apply|uninstall --runtime opencode`): places the 25 invocable agents under `{opencode_config}/agents/`, the full TS hook-plugin closure under `{opencode_config}/plugins/`, and registers `mcp.memory`/`mcp.context7` in `opencode.json` using `{env:VAR}` indirection — no literal secret is written to disk (`{env:MEMORY_MCP_BEARER}` / `{env:CONTEXT7_API_KEY}`) (SEC-DR-1).
- Go port of the `harness-migrate/migrate.mjs` CC→opencode frontmatter transform (`cmd/install/transform.go`): model provider-prefix (`anthropic/`), `tools→permission.allow`, `effort` dropped (opencode has no effort field), `mode: subagent` blanket (orchestrator overridden to `primary` by installer layer), `th-origin: opencode`; injection-form and prototype-pollution rejection applied recursively (SEC-DR-4); shared cross-language conformance fixture (`testdata/transform-conformance.json`) keeps the Go port in lockstep with `migrate.mjs`.
- Transform threaded into `ComputePlan` BEFORE `hashBytes` (S-1 idempotency fix): `PlannedFile.SrcHash` is now the hash of transformed bytes, guaranteeing that a second `apply` produces zero writes and zero ledger appends.
- SEC-05 leaf-exact allowlist for the `mcp` namespace (`manifest_schema.go` + `ledger.go`, SEC-DR-2): `mcp.memory` and `mcp.context7` are the only declarable leaves; bare `mcp` and any other `mcp.<x>` are rejected symmetrically at both validate and ledger-append time.
- Leaf-exact dotted-key delete in `deleteConfigKeys` (`uninstall.go`, SEC-DR-2): `mcp.memory`/`mcp.context7` are removed at the correct nesting level; sibling operator `mcp.*` servers are preserved; the `mcp` parent object is pruned only if it becomes empty.
- Hardened `Place` write path (`cmd/install/hardened_write.go`, SEC-DR-3): per-component Lstat symlink/reparse-point rejection, per-segment `mkdir` (no `MkdirAll`), `O_NOFOLLOW` leaf write on POSIX — applies to both `opencodePlacer` and `claudeCodePlacer` (additive, CC path unaffected for non-adversarial inputs).
- Runtime-scoped ledger filenames (`ownership-ledger-opencode.jsonl` vs `ownership-ledger.jsonl`): a claude-code uninstall cannot remove opencode-owned files and vice-versa.
- `kind: command` added to the `validKind` enum in `manifest_schema.go` (S-7): no command components are emitted today, but future command manifests will validate correctly.
- `go test ./cmd/install` CI job in `.github/workflows/test.yml`.

### Fixed

- `TestEmbeddedAssets_AgentCount` was asserting `wantAgents = 20`; updated to 25 (the live invocable count after applying the `_shared/`/`testing-refs/`/`README.md`/`ref-*.md` exclusion to the current roster).
- `TestEmbeddedAssets_AllExpectedAgents` roster was missing 7 agents added since its last update: `documenter`, `gcp-infra`, `mentor`, `qa-plan`, `research-consolidator`, `researcher`, `ux-reviewer`.
- `TestEmbeddedAssets_AgentCount` WalkDir now skips ALL `agents/` subdirectories (including newly-added `gcp-infra-refs/` and `review-lenses/`) rather than only `_shared` and `testing-refs`, preventing false inflation of the invocable count from reference material in subdirectories.
