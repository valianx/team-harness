# Architecture Decisions — Full History

> Overflow file for CLAUDE.md §8 Architecture Decisions. Most recent entries stay inline in CLAUDE.md; older entries accumulate here.

- **2026-06-29** — `refreshManagedConfigKeys`: update writes only managed keys (`format_version`/`installed_version`/`updated_at`); operator keys preserved. → `cmd/install/opencode_config.go`
- **2026-06-29** — `VERSION` asset: bare semver at `releases/latest/download/VERSION` (no GitHub API); best-effort pre-check. → `release.yml`
- **2026-07-19** — `adversary_floor_applies` narrows the `adversary` Phase-3 trigger to a strict subset of `security_floor_applies` (fail-closed to `true`); `security`'s own floor is unchanged. → superseded 2026-07-20 by the Pre-Delivery Security Audit consolidation, itself superseded 2026-07-21 by the adversary-only-conditional model (see CLAUDE.md §8 for the current model).
- **2026-07-20** — Security verification consolidated into the Pre-Delivery Security Audit (Phase 3.8, once per delivery group over the consolidated final diff): `security` unconditional, `adversary` on `security_floor_applies` alone; findings operator-disposed at STAGE-GATE-3, no autonomous security-lens iterations. Retires `adversary_floor_applies`, per-round reports, the staleness re-gate, and the whack-a-mole detector. → `agents/orchestrator.md § Phase 3.8` → superseded 2026-07-21 by the adversary-only-conditional model (see CLAUDE.md §8 for the current model).
