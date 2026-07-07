**Status:** DELIVERED | **Date:** 2026-07-06


# Plan: th-friction-redesign
**Date:** 2026-07-06
**Agent:** architect
**Reviews:** substance pass · security clean · shape pass → combined **pass**

## Review Summary

> This build ships WITHIN team-harness the redesign of the permission/friction model from the research report: the dev-guard moves from "every covered action → unconditional ask" to "gate by destination, allowing without a prompt the push of a non-default branch on `origin`", extends the permission-provisioning contract to distribute a read-only allowlist + read-only gh verbs + `mcp__memory__*` + `additionalDirectories` to every user, batches the GraphQL review mutations into a single aliased call with a mandatory preview, and adds a marker-based single-PR release path that preserves the three-version-site invariant decoupled from the branch name, reconciling the refined contract statement across ~10 sites. It touches a single repo / a single deployable unit (the `th` plugin); the main risk is security: because of bug #18312 an allow-rule overrides the hook's decision, so the shipped allowlist MUST be disjoint from the set of outward-actions (which excludes every form of `gh api`), verified by a catalogue-driven test with a canary.

**Tasks:** 5 | **Services:** team-harness | **Estimated complexity:** complex

### Decisions for human review
- **Delivery grouping = a single PR** — the research suggested one PR per WI "for review focus"; review-focus is NOT in the closed list of split reasons, and no temporal-prod reason (coexistence window / production signal / cross-repo deploy gate) applies in a single repo. The documented reviewability strategy is per-commit granularity within the PR. → decided as `all-tasks-one-pr`
- **Release of THIS build** — bootstrap: the marker-recognition path in prepublish-guard is not active until the new hook is installed, so THIS build is published with the current model (`skip-version: true` + `changelog.d/` fragment, cut deferred by `/th:release`). The single-PR path applies to future, already-installed builds. → decided as existing deferred cut
- **test.yml path-filter vs required-check trap** — a `paths-ignore` that skips a *required* status-check leaves it "pending" forever and blocks the merge. The safe pattern is a gate job that always runs and does a conditional no-op. → open question: adopt the conditional-noop pattern, or defer the CI optimization
- **Release-cut marker format** — `version.d/.release-cut` (in-tree file, durable signal, preferred) with `release-cut: vX.Y.Z` as a secondary commit-trailer. → decided as file-primary, trailer-secondary
- **PR-create autogate** — `gh pr create` stays gated by default with an `autogate.pr_create` opt-in (default off) read by the dev-guard's reader; accepted by the operator. → decided as gated-default + opt-in

### Proposed Approach
Reuse the repo's exact precedents instead of inventing mechanisms: (1) inject a `DevGuardReader` mirroring `PrepublishReader` (`prepublish-guard.ts:34-58`) and the payload-cwd resolution from `prepublish-guard.cc.ts:164-183`; the shim already translates `allow` (`shim.ts:301-315`), so it does not change. The push recognizer is a CLOSED form-allowlist: `allow` EXCLUSIVELY for a single recognized simple form (one refspec, destination = a known non-default branch on `origin`, without `+`/force/`--mirror`/`--all`/`--tags`/`--delete`), extracting the destination from the right side of the last colon; every other form → `ask`/`none`, never `allow`. Hybrid design: parse the explicit refspec without exec and run git ONLY for the bare push, with a static fallback to `{main, master}` and fail-closed to `ask`. (2) extend the mature contract of `docs/permission-provisioning.md` with a new class of allow-rules bounded by the disjunction invariant (#18312). (3) add a marker-recognition branch in `runFeaturePath`/`runVersionBumpCheck` that routes to the existing release-path, preserving (not relaxing) the three-site invariant. There are minor implementation-shape options (marker format, `--with` invocation form vs sub-mode), all with clear precedent; none forks the architecture.

### Confidence Score
**Confidence:** 6/10 (single-pass)
- Blast radius: ~25 files, two hook-bodies with their entries + dist, ~10 contract sites, CI, and new suites — the surface alone makes a second pass likely in the multi-site reconciliation or a dist rebuild.
- Prior art: very strong — `prepublish-guard` is an exact precedent for reader-injection + payload-cwd; the provisioning contract and the batching pattern are mature. This raises confidence.
- Unknowns: the reader exec in the opencode runtime (Bun) is a new subprocess surface (precedented but not identical), and the interaction of test.yml's path-filter with required-checks is a real CI trap.

### Patterns to Mirror
- `hooks/ts/bodies/prepublish-guard.ts:34-58` — the `PrepublishReader` interface; mirror as `DevGuardReader`.
- `hooks/ts/entry/prepublish-guard.cc.ts:21-125` — the actual reader (`execFileSync` git, fail-open to null) and `resolveWorktreeCwd:164-183` (scoping to the payload cwd); replicate for `dev-guard.cc.ts`.
- `hooks/ts/shim/shim.ts:301-315` — `outboundCC` already emits `permissionDecision:"allow"`; confirms the shim is NOT touched.
- `hooks/ts/bodies/prepublish-guard.ts:299-354` — `runFeaturePath`/`runReleasePath` + `resolveBranch`; extend with the marker branch.
- `docs/permission-provisioning.md` (full contract) + `skills/setup/SKILL.md:158-202` (§3a, gated-offer pattern) — extend for the allowlist.
- `tests/test_prepublish_bump_floor.sh` — real-git fixture pattern; basis for the branch-aware and marker tests.

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| #18312 — an allow-rule overrides the hook's decision; an allowlist that overlaps an outward-action would break the floor (push to main without a prompt) | high | Disjunction invariant: the shipped allowlist is disjoint from the dev-guard's outward-actions catalogue, verified by a catalogue-driven test with a canary |
| Incomplete `git push` recognizer — a refspec with a default destination (`HEAD:main`), multi-refspec, or `--mirror`/`--all` would auto-allow a push to `main` | high | CLOSED recognizer: `allow` only for a single recognized simple form; destination extraction (right side of the last colon); fail-closed on every unknown form |
| Exfil via attacker remote — a branch-aware check that only looks at the destination branch would auto-allow `git push <attacker-url> HEAD:feat` | medium | `allow` only when the remote resolves to `origin` by NAME; any other remote/URL → `ask`; the integrity of `origin`'s URL is a model assumption and remote-mutating commands stay out of the allowlist |
| Force-push escapes as `allow` (flag `-f`/`--force` or `+refspec`/`--mirror` prefix) | high | The dev-guard auto-detects force by FLAG and by `+refspec`/`--mirror` → `ask`, never `allow`; `policy-block` (policy-block.ts:58, flag-only) is NOT a backstop for `+refspec`/`--mirror` — the dev-guard self-covers |
| `gh api` in the allowlist would break disjunction #18312 (no `gh api` prefix is disjoint from the outward mutations) | high | Exclude EVERY form of `gh api` from the shipped set; the prefix-safe inert gh verbs (`gh pr view/list`, `gh issue view/list`) are included |
| Stale dist committed (any hook-body change requires a rebuild) | medium | `dist-freshness` job (rebuild+diff) + rebuild over the final tree before the push |
| Required-check trap with `paths-ignore` in test.yml | medium | Conditional-noop gate-job pattern instead of `paths-ignore`; see Decision 3 |
| New reader exec surface in opencode (Bun) | low | fixed argv, no input interpolation, timeout-bounded, fail-closed to `ask`; `prepublish-guard` precedent |
| Three-site invariant relaxed by the marker path | high-if-wrong | The marker authorizes RUNNING the release-path, never BYPASSING it: strict SEMVER_RE parse → deny on non-semver; requires the three sites + match; the fail-open on CLAUDE.md §3 is preserved unchanged |

### Trade-offs
- One large PR with per-concern commits over 5 per-WI PRs — follows the documented reviewability strategy (per-commit granularity), avoids 5 CI runs and 5 review/merge cycles; the cost is a single larger diff, mitigated by commit scoping and the task DAG.
- A marker-file decoupling the release-cut over relaxing the release-branch regex — preserves the three-site floor; the cost is a new marker artifact to manage.
- A hybrid parse-then-exec design in the dev-guard over always-exec — most cases are decided without spawning git (explicit refspec + static default-branch fallback); the exec is reserved only for the bare push, reducing the new subprocess surface.

### Classification block
- touches_http_api: false
- touches_ui: false
- touches_data_model: false
- touches_cli: true
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: false
- spans_multiple_services: false

Reasoning for the two non-trivial calls the dispatch requested: **touches_cli: true** because it introduces a new operator-facing invocation form (`/th:release --with <feature-branch>`) and changes the semantics of Step 3 (manual tag push → verify-only); the `sketches/cli-surface.md` sketch documents the surface. The change to the dev-guard's gate semantics over `git`/`gh` alters the *prompting*, not the command surface, and goes as a behavior note in that sketch. **touches_public_lib_api: false** because the `th` plugin is not imported as a library: the signature change `evaluate(input)` → `evaluate(input, reader)` is an internal implementation detail, and the gate's public *behavioral* contract is captured by the Multi-site invariants table + the cli-surface sketch, not by an importable signature. The rest are clearly false: there is no exposed HTTP API, no UI, no data model, no asynchronous messaging; there is no destructive data operation; and it touches a single repo / a single deployable unit.

### Multi-site invariants

Three invariants live in more than one file. Delivery Step 9.4a reads this table and verifies the consistency of each site; a missing site is invisible to the MATCH check.

**(a) Refined dev-guard contract statement** (reconcile across ALL sites, a single PR):

| Invariant | Site | File | Anchor / field |
|-----------|------|------|----------------|
| dev-guard refined statement | canonical gate table | `docs/dev-mode.md` | § Outward-Action Gate (table + statements lines 3, 13, 19) |
| dev-guard refined statement | output-style floor | `output-styles/developer-mode.md` | gate statement (≈ lines 51, 80) |
| dev-guard refined statement | how-it-works overview | `docs/how-it-works.md` | ≈ line 136 |
| dev-guard refined statement | setup gate summary | `skills/setup/SKILL.md` | ≈ line 251 + Step 4e report block |
| dev-guard refined statement | managed-block source | `skills/setup/managed-blocks/orchestrator-dispatch-rule.md` | § Outward-action gate (≈ line 18) — propagates to `~/.claude/CLAUDE.md` via `/th:update` |
| dev-guard refined statement | project bootstrap | `CLAUDE.md` | §5 (≈ line 166) |
| dev-guard refined statement | knowledge base | `docs/knowledge.md` | outward-action gate entry |
| dev-guard refined statement | CC adapter notes | `hooks/adapters/dev-guard.claude-code.yaml` | `notes` |
| dev-guard refined statement | opencode adapter notes | `hooks/adapters/dev-guard.opencode.yaml` | `notes` |

**(b) Three-version-site invariant + marker** (THIS build does NOT bump versions; sites documented for future delivery/release):

| Invariant | Site | File | Anchor / field |
|-----------|------|------|----------------|
| plugin version | version site 1 | `.claude-plugin/plugin.json` | `version` |
| plugin version | version site 2 | `.claude-plugin/marketplace.json` | `plugins[0].version` |
| plugin version | version site 3 | `CLAUDE.md` | §3 `**Current version:**` |
| release-cut marker | decoupling signal | `version.d/.release-cut` | content `vX.Y.Z` (or commit-trailer `release-cut: vX.Y.Z`) |
| marketplace schema version — **fenced: MUST NOT change** | schema-level version | `.claude-plugin/marketplace.json` | top-level schema `version` (NOT `plugins[0].version`) |

**(c) Provisioning allowlist content** (identical across the three sites, or referencing the canonical doc):

| Invariant | Site | File | Anchor / field |
|-----------|------|------|----------------|
| read-only allowlist set | canonical contract | `docs/permission-provisioning.md` | § "Read-only allowlist — disjointness invariant" (new) |
| read-only allowlist set | setup site A | `skills/setup/SKILL.md` | § 3a |
| read-only allowlist set | orchestrator site B | `agents/orchestrator.md` | Phase 0a Step 1g |
| disjointness (allowlist ∩ outward-actions = ∅) | outward-action catalogue source | `hooks/ts/bodies/dev-guard.ts` | outward patterns (GIT_PUSH_RE, GH_*_RE, …) referenced by the disjunction test |

---
