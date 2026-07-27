# Architecture Decisions — Full History

> Overflow file for CLAUDE.md §8 Architecture Decisions. Most recent entries stay inline in CLAUDE.md; older entries accumulate here.

- **2026-06-29** — `refreshManagedConfigKeys`: update writes only managed keys (`format_version`/`installed_version`/`updated_at`); operator keys preserved. → `cmd/install/opencode_config.go`
- **2026-07-19** — `adversary_floor_applies` narrows the `adversary` Phase-3 trigger to a strict subset of `security_floor_applies` (fail-closed to `true`); `security`'s own floor is unchanged. → superseded 2026-07-20 by the Pre-Delivery Security Audit consolidation, itself superseded 2026-07-21 by the adversary-only-conditional model (see CLAUDE.md §8 for the current model).
