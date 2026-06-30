### Fixed
- `agents/delivery.md`: removed stale conditional framing ("when dev mode is active / `~/.claude/.dev-mode-active` contains `dev_mode: true`") from the outward-action gate description; rewrote to state the gate is unconditional (SEC-DR-2).
- `docs/reasoning-checkpoint.md`: renamed "### Dev mode — Layer-1 hook is the active floor at all three boundaries" to "### Layer 1 — Hook is the active floor at all three boundaries"; removed the conditional `~/.claude/.dev-mode-active` qualification.
- `README.md`: replaced the "## Developer mode" section (which described `/dev-mode` skill and `~/.claude/.dev-mode-active` marker as a live feature) with "## Orchestrator disposition" that accurately reflects the unconditional top-level orchestrator architecture.
- `docs/install.md`: removed `~/.claude/.dev-mode-active` and the `/dev-mode` user-level skill from the list of fixed-path artifacts that `/th:update` re-syncs.
