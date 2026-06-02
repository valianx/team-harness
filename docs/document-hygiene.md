# Document Hygiene — Full Reference

> Extracted from CLAUDE.md §7b to keep the main file under its size cap. The cap numbers (35 KB trigger / 40 KB hard cap) and the offload trigger condition stay inline in CLAUDE.md §7b for quick reference by the delivery agent.

## File size cap mechanics

**CLAUDE.md must stay under 40 KB.** Claude Code warns above this threshold and performance degrades. The delivery agent checks file size after every update; if CLAUDE.md exceeds 35 KB, it must offload the largest non-structural section to `docs/` before committing. Structural sections (§1-§7) are exempt — they shrink by extracting detailed tables/protocols to docs/ files (as done with §7.4-7.6 → `docs/voice-guide.md` and §14 protocol → `docs/subagent-orchestration.md`).

## Section size rules

| Section | Max entries in CLAUDE.md | Overflow target |
|---------|------------------------|-----------------|
| Architecture Decisions (§8) | 10 | `docs/decisions.md` |
| Patterns & Conventions (§9) | 10 | `docs/patterns.md` |
| Known Constraints (§10) | 10 | `docs/constraints.md` |
| Testing Conventions (§11) | 10 | `docs/testing.md` |

When a section exceeds its limit, the delivery agent extracts older entries to the overflow file and replaces the section body with a pointer:

```
See `docs/decisions.md` for the full log. Recent entries kept inline below.
```

## What belongs in CLAUDE.md vs docs/

| CLAUDE.md | docs/ |
|-----------|-------|
| Golden commands (copy-paste ready) | Extended decision rationale |
| Tech stack summary (one table) | Migration guides, ADRs |
| Current conventions (active rules) | Historical patterns, superseded decisions |
| Architectural boundaries (one-liners) | Detailed constraint analysis |
| Pointers to docs/ files | The detailed content itself |

## docs/ structure

| File | Content | Updated by |
|------|---------|-----------|
| `docs/knowledge.md` | Flat bullets with tag prefixes — the agent pre-read file | delivery agent |
| `docs/decisions.md` | Architecture decisions overflow (date + decision + rationale) | delivery agent (auto-offload) |
| `docs/patterns.md` | Patterns overflow (pattern + example path) | delivery agent (auto-offload) |
| `docs/constraints.md` | Constraints overflow (constraint + detail) | delivery agent (auto-offload) |
| `docs/testing.md` | Testing conventions overflow (convention + description) | delivery agent (auto-offload) |

The delivery agent creates overflow files on first offload. Agents read `docs/knowledge.md` before every task; overflow files are read on-demand when the CLAUDE.md pointer section is relevant.
