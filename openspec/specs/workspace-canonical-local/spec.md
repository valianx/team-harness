# workspace-canonical-local Specification

## Purpose
Pipeline coordination state has one canonical home — the repository — on every runtime. Obsidian becomes a one-way, non-authoritative export instead of a live external dependency of the state machine.

## Requirements

### Requirement: Canonical pipeline state is repository-local
During an active pipeline, all coordination state (`00-state.md`, events, plan artifacts, evidence, delivery preview) SHALL live under `{repo}/workspaces/{feature}` regardless of runtime and of the configured `logs-mode`. Artifacts are never split across roots.

#### Scenario: A pipeline runs under obsidian logs-mode
- **WHEN** any phase writes coordination state
- **THEN** the write targets the repository workspace, succeeding independently of vault reachability

### Requirement: Obsidian receives a one-way export at terminal points
When `logs-mode: obsidian` is configured, the pipeline SHALL export the workspace to the vault atomically at draft-PR creation and at terminal close or pause. The vault copy is a non-authoritative view: never read for recovery, never synced back.

#### Scenario: Draft PR is created
- **WHEN** delivery completes the draft PR under obsidian mode
- **THEN** the workspace is exported to a new vault directory and the export result is recorded

#### Scenario: The vault is unreachable at export time
- **WHEN** the export fails (sandbox denial, unmounted path, latency timeout)
- **THEN** the run records `obsidian_sync: pending` and completes without blocking; a later explicit retry may export

### Requirement: Recovery reads only the repository workspace
Recovery SHALL resolve all state from the repository workspace; vault content is never an input to recovery decisions.

#### Scenario: A run is recovered on a machine without the vault
- **WHEN** `/th:recover` resumes a persisted pipeline
- **THEN** recovery proceeds fully from repository-local state

### Requirement: Direct-vault mode is an explicit opt-in
A live-in-vault workspace (`obsidian-direct`) SHALL be available only as an advanced opt-in gated behind the deterministic write probe; it MUST NOT be the default, and probe failure falls back to the repository workspace with the recorded reason.

#### Scenario: The operator opts into obsidian-direct and the probe fails
- **WHEN** the session's sandbox cannot write the vault root
- **THEN** activation falls back to the repository workspace and reports why, instead of blocking the pipeline
