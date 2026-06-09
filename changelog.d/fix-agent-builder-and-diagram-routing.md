### Fixed
- `agents/orchestrator.md` Step 6a intent table now contains engine-disambiguated diagram routing rows: "D2 / diagrama D2 / D2 diagram / dot" routes to the `d2-diagram` mode; "LikeC4 / C4 / architecture-as-code" routes to the `likec4-diagram` mode; generic "diagrama / diagram / visualizar arquitectura" routes to the `diagram` (Excalidraw) mode as the default. Eliminates mis-routing of D2/LikeC4 diagram requests to the Excalidraw engine.
- `agents/orchestrator.md` Step 6a intent table now contains a deterministic agent-builder routing row: "create/design/improve an agent or skill" routes to the `/th:agent-builder` skill flow (the canonical pipeline for agent/skill creation). The intent is routed to the skill flow; the agent is never bare-dispatched.
- `agents/orchestrator.md` `:150` standalone-agents note reconciled for `agent-builder`: mirrors the reviewer reconciliation from #291 — the orchestrator routes the agent/skill-building INTENT to the canonical flow, never bare-dispatches the agent. Explicitly documents the host-layer residual: Claude Code's native agent-description selector can dispatch `th:agent-builder` before the orchestrator sees the turn; no hook intercepts native selection; the Step 6a route covers only orchestrator-mediated requests.

### Changed
- Plugin version bumped 2.65.0 → 2.66.0.
