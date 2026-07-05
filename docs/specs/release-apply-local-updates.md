**Status:** DELIVERED | **Date:** 2026-07-04

## Review Summary

> `/th:release` currently ends at the tag push (Step 3): local application is pull-driven and was outside the flow, which is why v2.123.1 left the local opencode install on 2.119.3. This change adds a post-tag Step 4 that ensures both local runtimes receive the just-published version — a Claude Code leg (catalog refresh + `claude plugin update`, immediate because the catalog ships from `main`) and an opencode leg (gated on artifact publication via a bounded poll of the `VERSION` asset, then the `update-opencode.{sh,ps1}` updater). Touches one primary skill plus its tests/docs lockstep (6 files), decomposed into 1 task delivered as 1 PR. Main risk: a new structural check could displace the Step 3 slice and break Suite 132 — mitigated by fixing the exact Step 4 header and its position after Step 3's closing `---`.

**Tasks:** 1 | **Services:** team-harness-plugin (skill `release`) | **Estimated complexity:** standard

### Decisions for human review
- **Per-leg failure isolation vs. the published release** — a local-application failure (missing CLI, network, timeout) reports the manual command and never aborts or reverts the already-published release; the other leg continues. → decided as no-abort per-leg isolation (AC-4).
- **`delivery.md` stays untouched** — the local-apply step is purely skill-side (an action on the operator's machine post-merge); the `delivery` agent contract produces the PR + tag (Step 11.4c) and has no role pulling updates to local runtimes. → decided as skill-only; `delivery.md` untouched.
- **opencode publication-gate timeout** — bounded poll, 15s interval x 12 attempts (180s ceiling, ~3x `release.yml`'s ~1 min); on expiry reports state + manual command without aborting. → decided as 15s/12/180s.

### Proposed Approach
Add a `## Step 4 — Apply the release to local runtimes (post-tag)` to `skills/release/SKILL.md`, immediately after Step 3's closing `---` (preserves the Suite 132 slice). Step 4 runs two independent legs with per-leg failure isolation, following `/th:update`'s "run quietly, report once" discipline: (1) an immediate Claude Code leg — catalog refresh + `claude plugin update`, reports installed to downloaded, does NOT sync managed blocks (`/th:update`'s domain); (2) a gated opencode leg — polls the `VERSION` asset until it matches `{X.Y.Z}` with an explicit timeout, then runs the `update-opencode.{sh,ps1}` updater (repo when present, falling back to the Pages URL), reports the three-state delta. Both activations (`/reload-plugins` for CC; opencode restart) are explicitly left as operator actions — the version is never claimed active. The final report gains one row per runtime. Suite 132 is extended with checks that pin the new step; its count is reconciled in lockstep in `docs/testing.md`.

### Confidence Score
**Confidence:** 8/10 (single-pass)
- Strong prior art: `/th:update` (output discipline + report template) and `bin/update-opencode.{sh,ps1}` (VERSION pre-check + three-state) are direct templates to mirror; the spec (AC-1..AC-8) is explicit.
- Narrow blast radius: 6 files, mostly one skill plus its lockstep; no production code, no hooks, no `cmd/install/`.
- Only residual risk: the new Suite 132 check's wording/position must not disturb the Step 3 slice — de-risked by fixing the exact header and its Work Plan location.

### Patterns to Mirror
- `skills/update/SKILL.md:37-44` — "run quietly, report once" output discipline (no intermediate narration, one final report).
- `skills/update/SKILL.md:495-523` — final report template (titled status block, aligned values, neutral voice, no emoji); the Step 4 report mirrors this and adds per-runtime rows.
- `bin/update-opencode.sh:83-96` — VERSION pre-check pattern + three-state vocabulary (already current / installed ahead); the Step 4 poll gate mirrors this compare.
- `skills/release/SKILL.md:109-122` — shape of the existing Step 3; Step 4 anchors after its closing `---`.
- `tests/test_agent_structure.py:30542-30559` — `_slice_section` + `check(...)` pattern of Suite 132 (group a) for the new group d checks.

### Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| A new Suite 132 check displaces/breaks the Step 3 slice (group a) | medium | Fix the exact header `## Step 4 — Apply the release to local runtimes (post-tag)` and place it after Step 3's closing `---`; run `bash tests/run-all.sh` in lockstep. |
| Check count in `docs/testing.md` diverges from the real number of `check()` calls in the test | medium | Explicit multi-site invariant: the "N checks (M structural + 3 …)" literal in testing.md must equal Suite 132's `check()` count after the change. |
| The `VERSION` asset poll returns 404 or a stale version while `release.yml` is still running | low | Treat 404/mismatch/network hiccup as "not ready yet — keep polling"; compare exactly against `{X.Y.Z}`; 180s ceiling → reports timeout + manual command, does not abort. |
| A version literal leaks into the skill's prose | low | Use `{X.Y.Z}` placeholders throughout Step 4's conceptual prose (VERIFY AC-8). |

### Trade-offs
- Chose a skill-side Step 4 without touching `delivery.md` over also documenting local application in the agent contract, because `delivery` does not act on the operator's local runtimes, and mixing team-harness-internal tooling into the delivery contract consumed by other repos would be a responsibility leak. Cost: the "both sites document the full release flow" symmetry does not hold for the new step — mitigated because Suite 132 only requires the TAG step in both, and that step stays intact.
- Chose to have the CC leg NOT wait on the `VERSION` gate over coupling it to the same poll for flow simplicity, because the marketplace catalog ships from `main` (already merged before Step 3) and does not depend on `release.yml`; coupling it would delay immediate feedback behind a CI job that does not feed it.
- Chose NOT to duplicate managed-block sync inside Step 4 over replicating it, because it is a large atomic operation (a five-row matrix) owned by `/th:update` that would otherwise produce a second copy with drift; Step 4 is scoped to the download legs only.

### Classification block
- touches_http_api: false
- touches_ui: false
- touches_data_model: false
- touches_cli: false
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: false
- spans_multiple_services: false

### Multi-site invariants

| Invariant | Site | File | Anchor / field |
|-----------|------|------|----------------|
| Release-tag step anchor, Suite 132 group a (fenced: MUST NOT change) | skill flow | `skills/release/SKILL.md` | `## Step 3 — Create and push the release tag` |
| Release-tag step anchor, Suite 132 group b (fenced: MUST NOT change) | agent contract | `agents/delivery.md` | `### Step 11.4c — Release tag creation` |
| Suite 132 check count | test file | `tests/test_agent_structure.py` | number of `check(...)` calls under Suite 132 |
| Suite 132 check count | registry | `docs/testing.md` | `N checks (M structural + 3 self-referential/registry)` line for Suite 132 |
| Suite 132 checks enumeration | registry | `docs/testing.md` | `Checks: (a1-a3) … (d…)` line for Suite 132 |
