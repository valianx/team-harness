# Decision Log — gh-fallback Pattern (v2.10.0)

This document records the design decisions made during the gh-fallback graceful degradation design shipped in v2.10.0. The original architect design doc lives in `workspaces/gh-fallback-pattern/01-architecture.md` (gitignored); this file is the committed reference for the 20 open questions resolved at the operator gate.

Q-1 through Q-6 cover Part 1 (gh-fallback core). Q-7 through Q-10 cover §9.5 (Review policy loader). Q-11 through Q-15 cover §9.6 (Re-review automation). Q-16 through Q-20 cover §9.7 (Multi-reviewer orchestration).

---

## Q-1 — Non-GitHub origins (GitLab, Gitea, Bitbucket)

**Question:** If `git remote get-url origin` resolves to `gitlab.com/...` or `gitea.example.com/...`, the Tier A curl fallback has no target — its endpoints are GitHub-specific. How should non-GitHub origins be handled?

**Options considered:**
- (a) Treat any non-GitHub origin identically to "no origin" — fall straight through to the local-file escape hatch. [DEFAULT]
- (b) Add per-host adapters (GitLab REST, Gitea REST, etc.) — enlarges scope significantly but enables team-harness on those platforms.

**Decision:** (a) was selected — local-file fallback for all non-GitHub origins.

**Rationale:** The existing `gh` dependency already implicitly assumed GitHub-only. Option (a) preserves that semantic without scope expansion. Per-host adapters can be added in a future PR without breaking the v1 fallback chain.

---

## Q-2 — Wrong-account gh

**Question:** If `gh` is available but `gh auth status` shows the wrong account for the working-directory mapping (e.g., active account is `mgutierrez_evtech` but the directory maps to `valianx`), should the system error out or auto-switch?

**Options considered:**
- (a) Error out at the consumer with a clear message; let the operator switch manually. [DEFAULT]
- (b) Auto-switch via `gh auth switch -u <account>` based on a config map. The operator's global CLAUDE.md explicitly warns against auto-flipping in a hook ("Mejor que el agente lo decida con la regla de directorio"). This approach requires shipping a directory-to-account map, which is operator-machine state, not shared state.

**Decision:** (a) was selected — surface a clear error, require manual switch.

**Rationale:** The operator's stated preference (CLAUDE.md global note) is that agents decide per the directory rule, not hooks. Auto-switching in a shared snippet would violate that contract. A future PR could add per-operator config under `~/.claude/gh-account-map.json` if auto-switch becomes desirable.

---

## Q-3 — Token-based curl writes — opt-in or default

**Question:** When `gh` is unavailable but `$GH_TOKEN` (or `$GITHUB_TOKEN`) is set, should the Tier B fallback auto-use it for writes, or require an explicit opt-in flag (`TEAM_HARNESS_ALLOW_TOKEN_FALLBACK=1`)?

**Options considered:**
- (a) Auto-use `$GH_TOKEN` / `$GITHUB_TOKEN` if set; document loudly in the operator message. [DEFAULT]
- (b) Require explicit opt-in flag — prevents token reuse without awareness, but adds friction.

**Decision:** (a) was selected — auto-use the token if present.

**Rationale:** `$GH_TOKEN` is the GitHub-documented standard env var. Operators who set it expect it to be used for GitHub operations. The operator-facing message documents the auto-use behavior explicitly so there is no silent surprise.

---

## Q-4 — `status: blocked-manual-push` and autonomy-on flag

**Question:** The orquestador's `approve autonomous` flag at STAGE-GATE-1 allows it to skip STAGE-GATE-2 between PRs. Does this flag also bypass the `blocked-manual-push` pause when `gh` is unavailable?

**Options considered:**
- (a) `blocked-manual-push` is a mandatory pause regardless of the autonomy-on flag — mirrors STAGE-GATE-3 behavior. [DEFAULT]
- (b) Allow autonomy-on to bypass the pause (not proposed seriously — would require a human to open the PR silently).

**Decision:** (a) was selected — `blocked-manual-push` is always a mandatory pause.

**Rationale:** `blocked-manual-push` is functionally a sub-state of STAGE-GATE-3 (the PR has not been opened yet). STAGE-GATE-3 is always a human gate per CLAUDE.md §14. The autonomy flag covers STAGE-GATE-2 only. This is consistent with the existing gate semantics.

---

## Q-5 — Behavioural smoke test checklist

**Question:** Should a manual smoke-test checklist be added to `CONTRIBUTING.md` for verifying the gh-fallback path locally (e.g., uninstall gh temporarily and run `/issue #N`)?

**Options considered:**
- (a) Yes — one-paragraph addition to `CONTRIBUTING.md`. [DEFAULT]
- (b) No — trust structural tests; manual paths are implicit.

**Decision:** (a) was selected — add a smoke-test note to `CONTRIBUTING.md`.

**Rationale:** The structural test suite can verify cross-references but cannot exercise the fallback chain end-to-end (no live LLM in CI). A one-paragraph checklist in `CONTRIBUTING.md` gives future contributors a concrete verification path without requiring a live run.

---

## Q-6 — `agents/_shared/` as the canonical home for cross-cutting snippets

**Question:** Should the `agents/_shared/` directory become the standard home for all future cross-cutting snippets, or is gh-fallback special and future concerns go to `agents/ref-*.md`?

**Options considered:**
- (a) Create `agents/_shared/` — reusable directory for cross-cutting snippets consumed by multiple agents. [DEFAULT]
- (b) Keep `agents/ref-*.md` pattern — but `ref-*.md` is documented as orquestador-only, so non-orquestador consumers would muddy the contract.

**Decision:** (a) was selected — `agents/_shared/` is the canonical home.

**Rationale:** `ref-*.md` files are documented as orquestador-read-only reference files. Non-orquestador agents that cross-reference `ref-*.md` would violate that contract. The `_shared/` directory with installer recursion and structural test infrastructure is reusable for any future cross-cutting concern.

---

## Q-7 — Review policy schema shape: per-focus map vs per-rule tag

**Question:** Should `focus_overrides` in `.team-harness/review-policy.md` be a flat map (per-focus → rule-ID list) or per-rule (each rule declares its focus)?

**Options considered:**
- (a) Flat map at policy top — `focus_overrides: { security: [rule-ids], architecture: [rule-ids] }`. Denser but couples rule definitions to focus names. [DEFAULT]
- (b) Per-rule declaration — each rule carries a `focus:` tag. More flexible but verbose.

**Decision:** (a) was selected — flat map per focus.

**Rationale:** The flat map is compact for the common case (a small number of focus categories with a small number of per-focus rules). The coupling to focus names is acceptable because focus names are stable (three canonical focuses in v1: security, architecture, style).

---

## Q-8 — Cross-repo policy imports

**Question:** Should `.team-harness/review-policy.md` support `import:` directives to share rules across repos (e.g., a company-wide baseline policy)?

**Options considered:**
- (a) No imports in v1 — operators duplicate rules manually. [DEFAULT]
- (b) Yes — support `import:` directives for cross-repo policy sharing.

**Decision:** (a) was selected — no imports in v1.

**Rationale:** Cross-repo imports add parsing complexity (circular import detection, remote-fetch vs local-path resolution) that is out of scope for the initial implementation. The common cases (small teams, single repo) are well-served by per-repo policy files. Import support can be added in a future PR if operators request it.

---

## Q-9 — `/th:bootstrap` scaffold UX for review-policy

**Question:** How should `/th:bootstrap` expose the review-policy scaffold — as a separate `--scaffold-review-policy` flag, as an interactive prompt during normal `/th:bootstrap`, or implicitly when `.team-harness/` is missing?

**Options considered:**
- (a) Separate `--scaffold-review-policy` flag — explicit, discoverable. Companion to `--scaffold-rereview-workflow`. [DEFAULT]
- (b) Interactive prompt during normal `/th:bootstrap` — surfaces to all users but adds ceremony.
- (c) Implicit when `.team-harness/` is missing — automatic but surprising on first run.

**Decision:** (a) was selected — separate `--scaffold-review-policy` flag.

**Rationale:** Matches the pattern established by `--scaffold-rereview-workflow`. Operators who want the scaffold ask for it explicitly; those who do not need it are unaffected. Discovery is via `/th:bootstrap --help` and `docs/`.

---

## Q-10 — De-dup between policy rules and general-judgement findings

**Question:** If a policy rule matches a finding the reviewer would also flag under general judgement, should the general-judgement finding be suppressed?

**Options considered:**
- (a) Yes — de-dup by file:line; policy rule wins. [DEFAULT]
- (b) No — surface both; the human reviewer decides which is relevant.

**Decision:** (a) was selected — de-dup by file:line; policy rule wins.

**Rationale:** Duplicate findings at the same file:line add noise without value. Policy rules are operator-curated and more specific; they should take precedence over general judgement when they cover the same location.

---

## Q-11 — Doc-only-change filter in re-review workflow

**Question:** Should the re-review automation workflow detect doc-only diffs (e.g., changes only to `*.md` files) and skip the nudge comment, or always fire on every synchronize event?

**Options considered:**
- (a) Always fire — comment on every synchronize event; operator ignores if doc-only. [DEFAULT, deferred to v2]
- (b) Detect doc-only diffs and skip the comment in v1.

**Decision:** (a) was selected — always fire in v1; doc-only filter deferred to v2.

**Rationale:** Implementing a diff-content check in the GitHub Actions workflow adds complexity and an additional API call. The cost of a spurious re-review nudge on a doc-only sync is low (the operator ignores it). The filter can be added in v2 if noise becomes a real problem.

---

## Q-12 — Auto-dismiss + comment vs comment-only

**Question:** Should the re-review workflow combine GitHub's auto-dismiss-stale-reviews feature with the nudge comment, or only post the comment?

**Options considered:**
- (a) Comment-only — operator decides via the existing "Request Changes → Re-review" menu. [DEFAULT]
- (b) Auto-dismiss + comment — proactive, but takes control away from the reviewer.

**Decision:** (a) was selected — comment-only.

**Rationale:** Auto-dismiss is a branch-protection setting that affects all reviews globally. The team-harness workflow should not make irreversible decisions on the operator's behalf. Comment-only is the minimal non-destructive signal; the operator retains control over dismiss/re-request.

---

## Q-13 — Watch every PR vs label-gated

**Question:** Should the re-review automation workflow watch all PRs, or only PRs with a specific label (e.g., `team-harness:watch`)?

**Options considered:**
- (a) Watch every PR by default; add label filter in v2 if noise becomes a problem. [DEFAULT]
- (b) Label-gated from v1 — opt-in per PR.

**Decision:** (a) was selected — watch all PRs in v1.

**Rationale:** The intended use case is repos where team-harness reviews are the standard review mechanism. Watching all PRs matches that expectation. A label filter can be scaffolded in v2 for repos with mixed review approaches.

---

## Q-14 — Private-repo Actions billing surfaced at scaffold time

**Question:** Should `/th:bootstrap --scaffold-rereview-workflow` warn about Actions-minute consumption on private repos?

**Options considered:**
- (a) Yes — mention the billing note in the scaffold prompt (typically <1 minute per sync). [DEFAULT]
- (b) No — trust operators to understand GitHub Actions billing.

**Decision:** (a) was selected — surface the billing note at scaffold time.

**Rationale:** Private-repo Actions minutes are billed. Even low consumption per sync accumulates on active repos. A one-line note at scaffold time ("private repos consume Actions minutes — typically <1 min per PR sync") is low-ceremony and lets the operator make an informed choice.

---

## Q-15 — Comment author: operator account vs `github-actions[bot]`

**Question:** Should the re-review nudge comment be posted by the operator's account or by `github-actions[bot]`?

**Options considered:**
- (a) `github-actions[bot]` — operator receives a notification; clear attribution to the automation. [DEFAULT]
- (b) Operator account — GitHub suppresses self-notifications, so the operator would not be notified of their own reviews' staleness.

**Decision:** (a) was selected — post via `github-actions[bot]`.

**Rationale:** The purpose of the comment is to notify the operator that a prior review may be stale. Using the operator's account suppresses the notification via GitHub's self-notification filter. `github-actions[bot]` attribution also makes it clear the comment is automated, not a human's remark.

---

## Q-16 — Canonical focus list for multi-reviewer mode

**Question:** What is the canonical set of focuses for the multi-reviewer flow?

**Options considered:**
- (a) Three focuses in v1: `security`, `architecture`, `style`. [DEFAULT]
- (b) Expand to include `accessibility`, `performance`, `tests` in v1.

**Decision:** (a) was selected — three focuses: `security`, `architecture`, `style`.

**Rationale:** Three focuses map cleanly to the three most common review concerns for engineering teams. Additional focuses (`accessibility`, `performance`, `tests`) can be added in future PRs without breaking the schema — the focus list is open-ended by design.

---

## Q-17 — Consolidator contradiction handling

**Question:** If two focused reviewers contradict each other (e.g., security says "split this function", architecture says "merge these two"), what does the consolidator do?

**Options considered:**
- (a) Surface the contradiction as a flagged item in the consolidated review body; let the human decide. [DEFAULT]
- (b) Silently pick one reviewer's recommendation.

**Decision:** (a) was selected — surface contradictions explicitly; do NOT silently resolve.

**Rationale:** Silently picking one reviewer's recommendation would suppress legitimate signal from the other. The human reviewer is the authoritative arbiter of contradictions between focused perspectives. The consolidator's role is to aggregate and de-duplicate, not to adjudicate.

---

## Q-18 — Cost warning for multi-reviewer invocation

**Question:** Should `/review-pr #N --multi` warn the operator about the 3–4× cost increase before running (particularly when Opus is the configured model)?

**Architect's default:** Yes — warn for Opus invocations; suppress for Sonnet / low-cost mode.

**Operator override:** **REJECTED ENTIRELY.** No cost-warning UI under any circumstance.

**Decision:** Cost warnings are not implemented. Multi-reviewer runs proceed silently regardless of model configuration. Per-agent model configurations remain exactly as set. Operators accept the cost trade-off without a prompt.

**Rationale (operator override):** The cost-warning UI adds interaction friction on every multi-reviewer invocation. Operators who configure multi-reviewer runs have already made the decision to use them. A warning that must be acknowledged before every run degrades the tool experience without providing new information. If cost becomes a real concern, the operator's recourse is to switch models via `INSTALL_MODE=low-cost` or to configure individual agent models — both of which are already documented.

**Note:** This is the only operator override of the architect defaults across all 20 questions. It may be revisited if multi-reviewer cost becomes a documented pain point.

---

## Q-19 — Auto-suggest thresholds: hardcoded or policy-tunable

**Question:** Should the auto-suggest thresholds for recommending multi-reviewer mode (>1500 lines OR >8 files) be hardcoded or tunable via policy file frontmatter (e.g., `auto_multi_threshold_lines: 1500`)?

**Options considered:**
- (a) Hardcoded in v1; move to policy file in v2 if operators request. [DEFAULT]
- (b) Policy-tunable from v1.

**Decision:** (a) was selected — hardcoded in v1.

**Rationale:** The thresholds (>1500 lines, >8 files) are derived from empirical observation of PR sizes that benefit from focused review passes. Making them policy-tunable in v1 adds schema complexity before there is evidence of per-repo variation. The policy-tunable path is available as a v2 addition.

---

## Q-20 — Focus with empty policy `focus_overrides`

**Question:** If `--reviewers security` is invoked but `focus_overrides.security: []` in the policy file (an empty array), what rules does the security focus enforce?

**Options considered:**
- (a) Fall back to the focus's general categories (OWASP for security, SOLID+readability for architecture, style guides for style) — same behavior as if no policy existed. [DEFAULT]
- (b) Enforce nothing (empty policy → empty enforcement).

**Decision:** (a) was selected — fall back to general focus categories when `focus_overrides` is empty.

**Rationale:** An empty `focus_overrides` array most likely means the operator has not yet curated per-focus rules, not that they want the focus to enforce nothing. Falling back to the well-known general categories (OWASP for security, etc.) gives useful reviews in the absence of policy customization. Option (b) would silently produce a no-op review pass, which is misleading.
