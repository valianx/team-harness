## Purpose

Codex is a first-class runtime: sandbox failures diagnose to their real cause, declared agent capabilities equal effective capabilities, review artifacts stay inside the workspace, and hook wiring carries no process enforcement Claude Code already retired.

## ADDED Requirements

### Requirement: Sandbox diagnosis distinguishes shadowing from stale sessions
When a workspace write probe fails and the target root is declared in the operator-level config, preflight SHALL check whether the checked-out tree's project config declares `writable_roots`; if so it reports config shadowing with the concrete fix (update tree / regenerate config), and only otherwise advises a session restart.

#### Scenario: A pre-#601 tree shadows the global roots
- **WHEN** the write probe fails and the project `.codex/config.toml` declares `writable_roots`
- **THEN** the diagnosis names the shadowing and never enters a restart loop

### Requirement: Setup and update detect and repair sandbox drift
`/th:setup` and `/th:update` (Codex runtime) SHALL warn when the checked-out tree declares project-level `writable_roots`, and SHALL offer — behind the existing confirmation gate — to write required vault roots into the operator-level config with a merge that preserves unrelated keys, followed by the restart instruction. Config migration SHALL preserve structured values (`obsidian_tasks` stays an object; a degraded value is repaired or reported, never silently kept).

#### Scenario: Setup finds a shadowing project config
- **WHEN** setup runs on a tree whose project config declares writable roots while the global config declares the vault
- **THEN** the operator receives the drift warning and a gated offer to fix the operator-level config

### Requirement: Declared capability equals effective capability
The agent registry, generated TOMLs, and instruction adapters SHALL agree on each role's capabilities: review roles that read via bounded `exec_command` declare `command-exec`; the generator either emits an enforced allowlist or stops claiming the TOML confirms one; an integration test spawns each installed agent and performs a real fixture read through its actual transport.

#### Scenario: A review agent's transport is validated
- **WHEN** the projection test suite runs
- **THEN** each review role reads a fixture through its declared transport, failing the build when declaration and effect diverge

### Requirement: Review artifacts stay inside the workspace
The frozen review worktree SHALL live under the git-ignored `workspaces/` tree (not a predictable shared `/tmp` path) and SHALL be pruned at flow close.

#### Scenario: A review flow completes
- **WHEN** review publication or abort finishes
- **THEN** no prunable review worktrees remain outside the workspace tree

### Requirement: Codex hook wiring carries the deny floor only
The Codex plugin's PreToolUse wiring SHALL ship the deterministic deny floor (`policy-block`, `gcp-guard`); `gate-guard` is unwired or opt-in, receiving at most the minimal literal-compatibility update (`auto-ship`) and no new logic — matching Claude Code's v2.139.0 retirement of process-enforcing hooks.

#### Scenario: A Bash call runs under the Codex plugin
- **WHEN** the PreToolUse hook chain evaluates the call
- **THEN** only deny-floor hooks gate it, and a broken plugin cache surfaces as a reported launcher error rather than blanket tool denial
