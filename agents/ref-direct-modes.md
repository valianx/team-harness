---
name: ref-direct-modes
description: Reference file for orchestrator direct modes (diagram, likec4, d2, review, translate, plan-review). Read on-demand by the orchestrator — not a standalone agent.
model: opus
color: cyan
---

# orchestrator — Direct Mode Reference

This file is read on-demand by the orchestrator when executing a direct mode. It is NOT part of the orchestrator's system prompt.

**LAZY-LOAD DIRECTIVE — consumers read only the section they need.** Do NOT read this entire file on every invocation. Locate the top-level section heading for the active mode (e.g., Plan Review Mode, Review Mode, Translate Mode) and read only that section. Load additional sections only when the mode cross-references them explicitly. Every section heading below is preserved exactly so all `§ "Section Name"` pointers and structural-test anchors continue to resolve.

---

## Plan Review Mode (standalone audit of Stage 1 artifacts)

**When invoked:** the user wants to re-audit a Stage 1 plan after a manual edit, or wants to audit a plan produced under a previous orchestrator run, without re-running the full pipeline. Common trigger: developer hand-edits `01-plan.md` and wants to confirm the changes still satisfy the five plan-shape rules before continuing.

**Routing:** the user invokes `/th:plan-review {feature-name}` (or `audit my plan`, `revisa el plan`, "is my plan compliant?"). Skill payload is `Direct Mode Task: plan-review` with `feature_name`.

**Security-sensitivity detection (summary):** security reviewer runs when `00-state.md` declares `security-sensitive: true`, OR when a path glob match finds `auth/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**`, OR when a **semantic keyword match** detects security-relevant terms in prose (auth, token, jwt, password, secret, credential, PII, encrypt, decrypt, session, cookie, permission, privilege, signature, csrf, xss, injection, deserialize, unserialize, pickle, SSRF, webhook, upload, sanitize, xxe, ssti, traversal, redirect, cors — case-insensitive; ≥1 match is sufficient), OR when the operator passes `--security`. When security is SKIPPED (none of the above triggered), the output shows an affirmative visible notice: `SKIPPED — no security-sensitive path or keyword detected ... re-run with --security`. Fail-closed principle: a false-positive (security runs when not needed) costs one extra agent run; a false-negative (security skipped when needed) is the risk this mode exists to prevent. See gating detail in `§ "Review Panel"` below.

### Review Panel (three reviewers, one plan)

The `plan-review` direct mode runs a panel of up to three reviewers that fold their findings into a single `01-plan.md`. The dispatch order is fixed (earlier reviewers write before the final consolidator reads):

1. **`qa-plan` (mode: `ratify-plan`)** — substance reviewer. Validates AC coverage vs Work Plan. Writes `## Plan Ratification` (existing contract) AND writes its sub-verdict as the bold inline label `**Substance (qa):**` followed by a one-line verdict inside `## Plan Review`. Does NOT use a `###` heading for this label.
2. **`security` (mode: `design-review`)** — design-security reviewer. **Conditional:** runs only when the task is security-sensitive. When run, writes its sub-verdict as the bold inline label `**Security design-review (security):**` followed by `clean` or `risks-found` inside `## Plan Review`. Does NOT use a `###` heading.
3. **`plan-reviewer` (shape audit, runs last)** — sole writer of the `## Plan Review` header and the `**Combined verdict:**` block. Reads the sub-verdicts written by (1) and (2) to produce the combined verdict. Runs LAST so it can read the other sub-verdicts.

**Centralization contract:** the panel MUST NOT create any parallel side-file. Zero parallel correction-files. All findings fold in-place into `01-plan.md`. The consolidated `## Plan Review` section carries the three sub-verdicts as bold inline labels (`**Substance (qa):**`, `**Security design-review (security):**`, `**Combined verdict:**`) — never as `###` headings — so `## Plan Review` stays a single sliceable block from start to finish.

**Gating of security reviewer (step 2):** determine security-sensitivity in this order:
1. Read `00-state.md` (if it exists) and check for `security-sensitive: true` or `security_sensitive: true`.
2. If absent, derive from path/keyword heuristic: scan `### Services Touched`, `## Review Summary`, and the AC blocks in `01-plan.md` using TWO complementary checks — both are sufficient independently to trigger security:
   - **Path glob match:** scan for the existing pipeline path auto-escalation list — `auth/**`, `middleware/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**` — which is the same list used by the bug-fix pipeline (reused, not a new divergent list).
   - **Semantic keyword match (case-insensitive):** scan for security-relevant terms in prose — `auth`, `authentication`, `authorization`, `token`, `jwt`, `oauth`, `password`, `secret`, `credential`, `credentials`, `PII`, `encrypt`, `decrypt`, `encryption`, `session`, `cookie`, `permission`, `privilege`, `signature`, `csrf`, `xss`, `injection`, `deserialize`, `unserialize`, `pickle`, `SSRF`, `webhook`, `upload`, `sanitize`, `xxe`, `ssti`, `traversal`, `redirect`, `cors`. If ≥1 keyword is matched, treat as security-sensitive. (Note: this list — the design-review trigger list — is intentionally broader than Signal 1 in `orchestrator.md`, which is the escalation-to-Tier-4 list. The two lists serve different purposes and legitimately diverge; the divergence is by purpose, not drift. Signal 1 targets confirmed-exploit indicators; this list targets design-vulnerability classes. Do not merge them.)
   If either path glob match OR semantic keyword match finds a result, treat as security-sensitive.
3. Operator override: if the operator passed `--security` flag or explicitly said "include security" / "incluí seguridad", treat as security-sensitive regardless of the above.

**Process:**

1. Glob `workspaces/{feature-name}/`. If the folder does not exist, return a friendly message asking the user to first run `/th:design` or to confirm the feature name.
2. Confirm `01-plan.md` exists. If it is absent but `01-architecture.md` is present, prompt the user: "no `01-plan.md` — this looks like a legacy plan (pipeline_version 1) or an incomplete design. Run `/th:design {feature}` to produce the merged plan, or invoke `/th:plan-review` after the architect has emitted `01-plan.md`."
3. Invoke `qa-plan` (mode: `ratify-plan`) via Task tool. Wait for status block.
4. Determine security-sensitivity (per gating above). If security-sensitive, invoke `security` (mode: `design-review`) via Task tool. Wait for status block.
5. Invoke `plan-reviewer` via Task tool (always runs last). Wait for status block. Read `verdict` and `findings` counts from the combined verdict it writes.
6. Surface the combined verdict to the user (Output Discipline #186 — the combined verdict IS operator-facing; per-reviewer chatter is NOT). Direct mode does NOT emit a STAGE-GATE-1 STOP block.

**Vacuous-success guard (applies to this direct mode and to the design/research panels where the CLAUDE.md §5 centralization applies):** before surfacing the combined verdict, verify that the expected sub-verdict labels are present in `## Plan Review`:
- `**Substance (qa):**` — always required (qa always runs in the panel, for the `plan-review` direct mode and for the design/research panels).
- `**Security design-review (security):**` — required only when security ran (i.e., the task was determined security-sensitive). When security was skipped, absence of this label is expected and does not trigger the guard.
If a required label is absent, the panel is incomplete — do NOT surface a pass combined verdict. Report `blocked` / panel incomplete to the operator and prompt for a re-run.

**Scope note:** this guard applies to the `plan-review` direct mode and to the design/research panels. Diagram modes (`/d2-diagram`, `/likec4-diagram`, `/excalidraw`) do NOT dispatch a qa/plan-review panel — the guard does not apply there.

**Behaviour:**
- Zero side-files. All panel output folds in-place into `01-plan.md`. No agent creates a parallel review file.
- The consolidated `## Plan Review` section in `01-plan.md` is idempotent (preserve-in-place on subsequent invocations — upstream sub-verdicts are never overwritten by `plan-reviewer`).
- Does not append `stage.gate` events to JSONL — there is no pipeline.
- Inline fallback (nested-dispatch): if the Task tool is unavailable (nested context), run the panel reviewers sequentially inline using each agent's system-prompt file as the procedure spec — same order, same centralization contract.

**Output:**
```
Plan Review (direct mode): {feature-name}
**Combined verdict:** {pass | concerns | fail}
Substance (qa): {pass | fail}
Security design-review: {clean | risks-found | SKIPPED — no security-sensitive path or keyword detected in the plan. If this plan touches auth/crypto/session/PII, re-run with --security}
Shape (plan-reviewer): {pass | concerns | fail}

{if any findings:}
Top issues:
  - {file:line — rule — short description}
  ...

Full report: workspaces/{feature-name}/01-plan.md § Plan Review
```

---

## Diagram Mode (Excalidraw)

When invoked with `Direct Mode Task: diagram`:

**Observability:** diagram mode is a named observability exemption — it writes no `00-state.md` and no `00-execution-events` file. Its workspace is intentionally invisible to `/th:pipelines` and `/th:recover`. See `docs/observability.md § Lightweight direct-mode exemptions`.

### Step 0 — Resolve output path

If the task payload includes `Vault:` (non-null):
1. Read `~/.claude/config/obsidian-vaults.json`. If missing, report `status: blocked` with "obsidian-vaults.json not found".
2. Resolve the vault path from the config (use the named vault or `default`).
3. If `Folder:` is set, append it to the vault path. Create the folder if it does not exist.
4. Set output path to `{vault_path}/{folder}/diagram.excalidraw` (Excalidraw files render natively in Obsidian with the Excalidraw plugin).

If no `Vault:` in payload → use default: `workspaces/{feature}/diagram.excalidraw`.

### Step 1 — Architect analyzes codebase context

Invoke `architect` in **research mode** via Task tool with:
- The diagram request (what to visualize)
- Feature name for workspaces
- Instruction: "Analyze the codebase/system to extract the components, relationships, data flows, and boundaries needed to create a diagram. Focus on: what exists, how pieces connect, and what the visual structure should emphasize. Produce a structured analysis in `workspaces/{feature}/00-research.md` — do NOT produce a diagram."

Gate: if `status: failed` → report to user and stop.

### Step 2 — Invoke diagrammer

Invoke `diagrammer` via Task tool with:
- Feature name
- Path to architect's analysis: `workspaces/{feature}/00-research.md`
- Path to skill: `.claude/skills/excalidraw-diagram/`
- Output path: `{resolved output path from Step 0}`
- **Expected sections:** list the major sections from the architect's analysis

### Step 2.5 — Validate diagrammer output (MANDATORY)

After the diagrammer returns `status: success`, **read the `.excalidraw` file** and check:

1. **Has arrows** — count elements with `"type": "arrow"`. If 0 → REJECT.
2. **Element count reasonable** — comprehensive diagram should have 80+ elements.
3. **Key components present** — scan text elements for key terms from the analysis.

**If validation fails:** re-invoke diagrammer with specific feedback. Max 2 re-invocations.

### Step 3 — Report to user

Present output file path and summary. If output is in an Obsidian vault, note that the Excalidraw plugin is required to render it. If output is in workspaces, present renderer setup instructions:
```bash
cd .claude/skills/excalidraw-diagram/references
uv sync
uv run playwright install chromium
```

---

## LikeC4 Diagram Mode

When invoked with `Direct Mode Task: likec4-diagram`:

### Step 0 — Resolve output path

If the task payload includes `Vault:` (non-null):
1. Read `~/.claude/config/obsidian-vaults.json`. If missing, report `status: blocked` with "obsidian-vaults.json not found".
2. Resolve the vault path from the config (use the named vault or `default`).
3. If `Folder:` is set, append it to the vault path. Create the folder if it does not exist.
4. Set output path to `{vault_path}/{folder}/diagram.c4`.

If no `Vault:` in payload → use default: `workspaces/{feature}/diagram.c4`.

### Step 1 — Architect analyzes codebase context

Invoke `architect` in **research mode** via Task tool with:
- The diagram request (what to visualize)
- Feature name for workspaces
- Instruction: "Analyze the codebase/system to extract the components, relationships, data flows, and boundaries needed to create a LikeC4 architecture diagram. Focus on: entry points, services, databases, queues, external dependencies, and actors. Produce a structured analysis in `workspaces/{feature}/00-research.md` — do NOT produce a diagram."

Gate: if `status: failed` → report to user and stop.

### Step 2 — Invoke likec4-diagrammer

Invoke `likec4-diagrammer` via Task tool with:
- Feature name
- Path to architect's analysis: `workspaces/{feature}/00-research.md`
- Path to skill: `.claude/skills/likec4-diagram/`
- Output path: `{resolved output path from Step 0}`

Gate: if `status: failed` → report to user. If `status: blocked` (CLI not installed) → relay install instructions: `npm install -g likec4` or `npx likec4`.

### Step 3 — Report to user

Present output file path, view names, and how to render:
- Preview: `npx likec4 start`
- Export: `npx likec4 export png`

In obsidian mode, the agent appends one `![[diagram_<viewId>.png]]` embed per exported view to `{docs_root}/05-diagram.md`. Report the embed count and note that the diagrams display inline in Obsidian. If the CLI was absent (`render: skipped`), note that the source is available but images could not be rendered.

---

## D2 Diagram Mode

When invoked with `Direct Mode Task: d2-diagram`:

### Step 0 — Resolve output path

If the task payload includes `Vault:` (non-null):
1. Read `~/.claude/config/obsidian-vaults.json`. If missing, report `status: blocked` with "obsidian-vaults.json not found".
2. Resolve the vault path from the config (use the named vault or `default`).
3. If `Folder:` is set, append it to the vault path. Create the folder if it does not exist.
4. Set output path to `{vault_path}/{folder}/diagram.d2`.

If no `Vault:` in payload → use default: `workspaces/{feature}/diagram.d2`.

### Step 1 — Architect analyzes codebase context

Invoke `architect` in **research mode** via Task tool with:
- The diagram request
- Feature name for workspaces
- Instruction: "Analyze the codebase/system to extract the components, relationships, data flows, and boundaries needed to create a D2 diagram. Produce a structured analysis in `workspaces/{feature}/00-research.md` — do NOT produce a diagram."

Gate: if `status: failed` → report to user and stop.

### Step 2 — Invoke d2-diagrammer

Invoke `d2-diagrammer` via Task tool with:
- Feature name
- Path to architect's analysis: `workspaces/{feature}/00-research.md`
- Path to skill: `.claude/skills/d2-diagram/`
- Output path: `{resolved output path from Step 0}`

Gate: if `status: failed` → report to user. If `status: blocked` (d2 not installed) → relay install instructions.

### Step 3 — Report to user

Present source file path, SVG output path, and re-render options:
- Dark theme: `d2 --theme 300 diagram.d2 dark.svg`
- Hand-drawn: `d2 --sketch diagram.d2 sketch.svg`
- Better routing: `d2 --layout elk diagram.d2 elk.svg`

In obsidian mode, the agent appends a `![[diagram.svg]]` embed to `{docs_root}/05-diagram.md`. Report the SVG path and note that the diagram displays inline in Obsidian. If the CLI was absent (`render: skipped`), note that the source is available but the image could not be rendered.

---

## Review Mode

When invoked with `Direct Mode Task: review`:

The `/review-pr` skill handles ALL Bash (fetching PR metadata, git diff, etc.) and passes everything inline. The orchestrator and reviewer do ZERO Bash. The skill may request different submodes depending on whether a prior review exists.

**No-publish invariant:** the reviewer NEVER calls any GitHub API write endpoint. In all submodes (fresh, update-body, reply, internal), the reviewer returns a draft inline in its status block. The orchestrator writes the draft to a file and returns control to the skill. Publishing is the sole responsibility of the execution site that receives operator approval — one of three sites:
- **Skill Phase 4 / Phase 5** (`skills/review-pr/SKILL.md`): the decision menu is the preview gate; Phase 5 does the atomic `POST /reviews`.
- **Orchestrator direct-mode path**: presents the draft and waits for operator OK before calling any write verb.
- **Takeover/inline path** (top-level Claude after Task-strip): same requirement — present the draft and wait before calling any write verb. This is the least-supervised path and the highest-risk gap if the gate is absent.

The `### Publish Gate (preview-and-confirm)` section below defines the full contract binding all three sites.

### Publish Gate (preview-and-confirm)

**Purpose (closes #252 — CWE-862):** This gate is bound to the ACTION that publishes, not to the mode or to who executes. Before ANY GitHub-write verb over a review or comment is executed — in ANY execution site — the operator must explicitly approve a preview of the full draft.

**Complete list of covered verbs (no exceptions):**
- `gh pr review` / `POST /repos/:o/:r/pulls/:n/reviews` — fresh review submission
- `PUT /repos/:o/:r/pulls/:n/reviews/:id` — update review body
- `POST /repos/:o/:r/pulls/:n/comments/:id/replies` — reply to inline comment thread
- Dismiss: `PUT /repos/:o/:r/pulls/:n/reviews/:id/dismissals`

**Default behaviour — preview-first:**
1. Before invoking any verb above, return the full draft (`review_body` + `inline_findings`, or the applicable body) to the operator.
2. Show the draft explicitly.
3. Wait for an explicit OK (e.g., confirmation in the Phase 4 decision menu, or an explicit `sí`/`yes`/`approve` in the conversational path).
4. Only after receiving explicit approval, execute the write verb.

**Opt-in flag:** `--auto-publish` skips the preview step ONLY when the operator has explicitly declared it in the invocation. Without the flag, preview is mandatory.

**Execution sites — this gate applies at ALL three:**
1. **Skill Phase 4 / Phase 5** (`skills/review-pr/SKILL.md`) — decision menu is the existing preview-and-confirm mechanism; `--auto-publish` skips it.
2. **Orchestrator direct-mode path** — when the orchestrator handles review without going through the skill's Phase 4, it MUST present the draft and wait for approval before calling any verb above.
3. **Takeover/inline path** (top-level Claude after Task-strip, the least-supervised execution site) — the same gate applies. If top-level Claude reconstructs a publish by calling `gh api .../reviews` directly, it MUST present the draft and wait for explicit approval before executing. There is no execution path that bypasses this gate.

**Anti-drift anchor:** Suite 57 in `tests/test_agent_structure.py` asserts the gate token at each of the three execution sites. A site that loses the gate turns the suite red.

### Dual-Review Convergence

The convergence protocol is an optional loop that wraps the existing per-pass consolidation flow. It applies when the review is Tier 4 (auto-on) or when the operator passes the `--converge` flag. For Tier 0–3 reviews without `--converge`, the single-pass path runs unchanged.

**Trigger conditions (either is sufficient):**
- PR classified as Tier 4 (security-sensitive paths or security keywords) — auto-on.
- Operator passes `--converge` flag in the skill invocation — manual opt-in for high-risk non-Tier-4 PRs.

**Loop contract:**

Each convergence round dispatches **two isolated consolidated passes** — Pass A and Pass B. Each pass runs the tier-appropriate reviewer set through `reviewer-consolidator`, writing to disjoint suffixed draft paths (`.claude/pr-review-final-A.md` / `.claude/pr-review-inline-A.json` for Pass A; `-B` equivalents for Pass B). The two passes run concurrently. They never read each other's drafts — context-isolation between the two passes is mandatory and enforced by the dispatch contract (each pass receives only the original diff, policy, and PR metadata from the current round).

**Comparator — three branches:**
1. Both passes emit `APPROVE` → verdict is `CONVERGED_APPROVE`. Proceed to the existing Publish Gate.
2. Both passes emit `REQUEST_CHANGES` → verdict is `CONVERGED_CHANGES`. Proceed to the existing Publish Gate with a `REQUEST_CHANGES` event.
3. Passes diverge (one `APPROVE`, one `REQUEST_CHANGES`):
   - If `round < 3`: run a **fresh round**. Round-N reviewers receive ONLY the original diff/policy/conversation — no artifacts from any prior round are passed forward. Freshness is mandatory; prior-round outputs must not appear in the next round's dispatch.
   - If `round == 3` and still divergent: **STOP and escalate** both review bodies to the operator with a structured comparison. The system never auto-resolves a divergence by picking a winner between the two passes. The operator decides.

**Hard cap:** max 3 rounds. Round counting begins at 1. Escalation on round-3 divergence is unconditional.

**Pre-gate positioning:** Convergence runs strictly BEFORE the Publish Gate. The loop never calls a GitHub write verb (`gh pr review`, `POST /reviews`, `PUT`, `POST /comments`, or any equivalent). Writing to GitHub is the sole responsibility of the Publish Gate after operator approval.

**Round-state recording:**
- `00-state.md` carries a `convergence` block: `round`, `last_verdict_A`, `last_verdict_B`, `status` (`running` / `converged` / `escalated`).
- The execution-events trace receives a `review.convergence.round` event for each round, carrying `round`, `verdict_A`, `verdict_B`, and `outcome` (`converged_approve` / `converged_changes` / `divergent_continue` / `divergent_escalate`).

**Escalation format (round-3 divergent STOP block):**
```
STOP — Dual-Review Convergence: reviewer disagreement after 3 rounds.
Pass A verdict: {APPROVE | REQUEST_CHANGES}
Pass B verdict: {APPROVE | REQUEST_CHANGES}
Pass A body: {.claude/pr-review-final-A.md}
Pass B body: {.claude/pr-review-final-B.md}
Action required: operator reviews both bodies and decides the final verdict.
The system cannot auto-resolve this disagreement. Resume with the chosen verdict.
```

**Pipeline call site:** The SDD pipeline's Phase 4.5 internal review (`agents/orchestrator.md § Phase 4.5 — Internal Review`) reuses this same convergence contract for its pre-STAGE-GATE-3 dual-review pass. The `skills/review-pr` Phase 3.1 standalone path and the pipeline Phase 4.5 path are the two call sites of this contract.

## Read-Only Working-Tree Guard

This guard applies to the `review` direct mode running over the operator's active repository. It does NOT apply to the `/th:review-pr` skill flow, which already runs in a separate worktree with a cleanup trap (`skills/review-pr/SKILL.md:71-78`) and does not mutate the operator's checkout.

### Layer 1 — No-dispatch

Review mode MUST NOT dispatch `implementer` or any agent that has write tools over working-tree source files. The review pipeline invokes only `reviewer` and (in multi-reviewer mode) `reviewer-consolidator`. Any intent that would require implementation work must be routed to the full pipeline, not handled within a review mode invocation.

### Layer 2 — Deny-tools (system-prompt prohibition)

`reviewer` and `reviewer-consolidator` both declare `Edit` and `Write` in their frontmatter tool grants. Those grants cannot be revoked from the dispatch side; the prohibition is therefore expressed as an imperative constraint in each agent's system prompt (see `agents/reviewer.md` § Read-Only Working-Tree Contract and `agents/reviewer-consolidator.md` § Read-Only Working-Tree Contract). The permitted writes for each agent are:

- `reviewer-consolidator`: ONLY `.claude/pr-review-*` draft files (`.claude/pr-review-final.md`, `.claude/pr-review-inline.json`, etc.).
- `reviewer`: ONLY the workspace doc `workspaces/{feature-name}/04-review.md`.

NEVER write to source files, configuration files, or any other path in the working tree outside those two zones.

### Layer 3 — Tree-verify

Scope: the `review` direct mode over the operator's active repo only.

The orchestrator captures the working-tree state BEFORE invoking the reviewer:

```bash
git status --untracked-files=all
git diff HEAD
```

After the review completes, the orchestrator re-verifies using the same commands. The tree is considered clean if it is byte-identical to the pre-review state EXCEPT for the allowlisted draft zone `.claude/pr-review-*`.

Verification uses `git status --untracked-files=all` (not plain `git status`) to capture new untracked files outside the allowlisted zone — those would not appear in `git diff HEAD` and would otherwise be silently missed.

If the post-review state differs outside the `.claude/pr-review-*` zone, the orchestrator MUST surface the detected changes explicitly as a defect:

```
review mode modified the working tree — this is a defect.
Detected changes outside the allowed draft zone:
{output of git status / git diff showing the unexpected changes}
```

The review output is still returned to the operator, but the defect report is prepended so the operator is aware of the unexpected mutation before approving any publish step.

### Layer 4 — Mode-transition gate

**Purpose (closes #251 mode-bleed):** Corrective language from the operator during an in-progress review NEVER auto-routes to the full pipeline. This gate covers both the same-turn case and the fresh-turn re-entry case (see `orchestrator.md` Step 6 `review_context` guard).

**When this gate fires:** Any of these signals appear while a review session is active (i.e., `review_context` is set in `00-state.md`):
- Corrective language directed at the PR under review: "debemos corregirlo", "hay que arreglarlo", "fix this", "fix X", "corrige X", "arréglalo", "corrígelo", "implementa el fix", "aplica los cambios".
- Instructions to edit/commit/push on the PR branch while in review mode.

**Required behaviour — the gate NEVER auto-routes:**
1. Surface the finding as part of the review output (e.g., "This finding requires a code change.").
2. Emit an explicit mode-transition prompt and WAIT for an affirmative response:
   ```
   En modo review (solo hallazgos). ¿Salir de review e iniciar el pipeline de implementación sobre este PR? [implementar/seguir-revisando]
   ```
3. On an explicit `implementar` (or equivalent affirmative) response: clear `review_context` from `00-state.md`, then proceed to the full pipeline (Step 7 classify + Discover).
4. On any other response (or no response): remain in review mode. Do NOT dispatch `implementer`. Do NOT exit review mode.

**The global routing rule ("route all dev tasks through orchestrator") is neutralized within review mode and during the `review_context` window.** A corrective message that would otherwise map to `full pipeline` in Step 6 MUST pass through this gate first.

### Layer 5 — Branch-author guard

**Purpose (closes #251 another-author-branch):** Before ANY edit/commit/push on a PR branch, the orchestrator resolves two identities and fails closed if either is indeterminate.

**Identity resolution (fail-closed by design — CWE-697):**
- Author of the PR: `gh pr view {N} --json author --jq '.author.login'`
- Identity of the operator: `gh api user --jq '.login'`

**Decision matrix:**

| Author resolved? | Operator resolved? | Author == Operator? | Result |
|---|---|---|---|
| Yes | Yes | Yes | No gate — allow mutation |
| Yes | Yes | No | Fail-closed — emit confirmation prompt and WAIT |
| No (any) | — | — | Fail-closed — emit confirmation prompt and WAIT |
| — | No (any) | — | Fail-closed — emit confirmation prompt and WAIT |

**Prohibited pattern — `unknown == unknown` → fail-open is FORBIDDEN.** If `gh pr view` fails (network, no auth, PR not found) OR if `gh api user` fails (not authenticated, login unavailable in session), the guard MUST treat the unresolvable side as indeterminate and fail closed. It MUST NOT compare two unresolved values and interpret the comparison as a match. The only path to allowing mutation without the gate is when BOTH identities resolve with certainty AND they are equal.

**Confirmation prompt (when gate fires):**
```
Esta branch pertenece a otro autor ({author}) o la identidad del autor/operador no pudo resolverse. Editar/commitear/pushear sobre este PR requiere confirmación explícita. ¿Continuar? [sí/no]
```
Default: rechazar (no). Without an explicit `sí` the mutation is rejected.

**Independence from Layer 4:** Confirming the mode transition ("implementar") does NOT implicitly confirm this gate. Layer 4 and Layer 5 are independent; both must be satisfied before any branch mutation proceeds.

### Submode routing

Check the `Submode` / `Mode` field in the task payload:
- `Mode: review-consolidate` → jump to **Step 2d** (Consolidation — multi-reviewer merge)
- `Submode: update-body` → jump to **Step 2b** (Update Body)
- `Submode: reply` → jump to **Step 2c** (Reply)
- No submode or `Submode: fresh`, with `Focus:` field → **Focused Fresh Review** (step 2 with Focus parameter)
- No submode or `Submode: fresh`, no `Focus:` → proceed to **Step 1** (Fresh Review, default)

### Step 1 — Receive pre-fetched data (Fresh Review)

The skill already passed all data inline. Extract:
- PR number, title, body, author, base/head branches, additions/deletions, URL
- Linked issue (number, title, body, labels) or "none"
- Changed files list
- Full diff (may be truncated if >3000 lines)

Zero Bash in this step.

### Step 2 — Invoke reviewer (Fresh Review)

Invoke `reviewer` in **fresh mode** via Task tool, passing ALL data inline. Include the policy fields when present:

```
mode: data-provided
PR: #{number}
Title: {title}
Author: {author}
Base: {base}
Head: {head}
Additions: +{N}
Deletions: -{N}
URL: {url}
Body: {body}
Linked Issue: #{issue_number} or "none"
Issue Title: {title} or "N/A"
Issue Body: {body} or "N/A"
Issue Labels: {labels} or "N/A"
Has Policy: {true|false}
Review Policy: {verbatim content of .team-harness/review-policy.md, or omit when Has Policy: false}
Changed Files:
{file list}
Full Diff:
{diff}
```

### Step 2b — Invoke reviewer (Update Body)

Invoke `reviewer` in **update-body mode** via Task tool. Pass the changed-files list only — omit the full diff (the reviewer updates the existing body based on what files changed, not by re-reading the full diff):

```
mode: update-body
PR: #{number}
Title: {title}
Author: {author}
URL: {url}
Existing review ID: {review_id}
Existing review body: {current body text}
Changed Files:
{file list}
```

Take `review_body` from the reviewer's status block and write it to `.claude/pr-review-draft.md`. Jump to Step 3.

### Step 2c — Invoke reviewer (Reply)

Invoke `reviewer` in **reply mode** via Task tool. Pass the thread context and the changed-files list only — omit the full diff (the reply scope is the thread, not the whole diff):

```
mode: reply
PR: #{number}
Title: {title}
Author: {author}
URL: {url}
Thread context:
  comment_id: {selected_id}
  path: {file path}
  line: {line number}
  original_body: {the inline comment text}
Changed Files:
{file list}
```

Take `reply_body` from the reviewer's status block and write it to `.claude/pr-review-reply-draft.md`. Return to the skill:
```
Reply draft written to .claude/pr-review-reply-draft.md
Thread ID: {comment_id}
```

The skill handles user approval and publishing via `POST .../comments/{id}/replies`.

### Step 2d — Consolidation (Mode: review-consolidate)

Invoked when the skill ran 2+ parallel focused reviewers and needs the drafts merged.

Extract from the payload:
- `Focuses:` list (e.g., `["security","architecture","style"]`)
- PR metadata (number, title, author, URL)

Invoke `reviewer-consolidator` via Task tool, passing:
```
Focuses: {focuses list}
PR: #{number}
Title: {title}
Author: {author}
URL: {url}
Draft Files: .claude/pr-review-draft-{focus}.md per focus
Inline Files: .claude/pr-review-inline-{focus}.json per focus
```

The consolidator reads the focus draft files, applies de-dup rules, builds the unified review_body and inline_findings, and writes `.claude/pr-review-draft.md` and `.claude/pr-review-inline.json`.

Return to the skill:
```
Consolidated review draft written to .claude/pr-review-draft.md
Decision: {APPROVE or CHANGES_REQUESTED}
Contradictions: {true|false}
```

### Step 3 — Build draft

Take `review_body` from the reviewer's status block and write it to `.claude/pr-review-draft.md`.

**Validation:** If `review_body` is empty, re-invoke reviewer once. If still empty, return `status: failed`.

Read `.claude/pr-review-draft.md` back to confirm it was written correctly.

If the reviewer also returned `inline_findings`, write them to `.claude/pr-review-inline.json` (fresh mode only).

Return to the skill:
```
Review draft written to .claude/pr-review-draft.md
Decision: {APPROVE or CHANGES_REQUESTED}
```

The skill handles user approval and publishing.

---

## Translate Mode

When invoked with `Direct Mode Task: translate`:

The `/translate` skill passes mode, submode, scope, and language configuration.

### Submode: glossary-only

Skip to Step 2 with `mode: glossary-only`. No code modification, no parallelism needed. Report glossary and stop.

### Submode: translate-only

Skip to Step 4 (Parallel dispatch) with existing glossary and i18n setup. Useful for incremental translation after new strings are added.

### Submode: full (default) — Parallel Pipeline

```
Step 1   Setup workspaces
Step 2   Translator (sequential): Discovery + Glossary + i18n Setup  [Phase 0-2]
Step 3   Evaluate parallelism: split inventory by module
Step 4   N Translators (parallel worktrees): Extract + Replace        [Phase 3-4]
Step 5   Translator (sequential): Merge locales + Build verify        [Phase 5]
Step 6   Report to user
```

### Step 1 — Setup workspaces

1. Create `workspaces/{feature-name}/` if it doesn't exist
2. Write initial `00-state.md` with `phase: translate`, `status: in_progress`
3. Initialize the events file (local mode: `00-execution-events.jsonl`; obsidian mode: `00-execution-events.md`) with the opening `pipeline.start` event so `/th:pipelines` and `/th:recover` see a trace alongside the state file

### Step 2 — Discovery + Glossary + i18n Setup (sequential)

Invoke `translator` in **full mode** via Task tool with:
- Feature name
- Scope: directory path or "full project"
- Source language: `es` (Spanish)
- Target language: `en` (English neutral)
- Instruction: "Run Phase 0 (Discovery), Phase 1 (Glossary), and Phase 2 (i18n Setup) ONLY. Do NOT proceed to Phase 3 or Phase 4. Save the glossary to `docs/glossary.md`, write the string inventory to `workspaces/{feature}/00-translation.md`, and return. Include in your status block: `framework`, `i18n-library`, `locale-dir`, `key-convention`, `interpolation-syntax`, and `module-split` (proposed directory groupings with string counts)."

Gate: if `status: failed` → read `00-translation.md` to diagnose, report to user.
Gate: if `status: blocked` → relay the blocker.

**Expected status block extras:**
```
framework: {react|next|vue|angular|svelte|...}
i18n-library: {react-i18next|next-intl|vue-i18n|...}
locale-dir: {path to locale directory}
key-convention: {namespace}.{section}.{descriptor}
interpolation-syntax: {t('key')|$t('key')|...}
module-split:
  - namespace: auth, dir: src/pages/auth/, strings: 45
  - namespace: dashboard, dir: src/pages/dashboard/, strings: 82
  - namespace: common, dir: src/components/, strings: 63
  - namespace: settings, dir: src/pages/settings/, strings: 28
total-strings: 218
```

### Step 3 — Evaluate parallelism

Read the `module-split` from the translator's status block and decide:

- **≤50 strings total OR ≤2 modules** → skip parallelism, re-invoke single translator in `translate-only` mode to handle Phase 3-4-5 sequentially. Jump to Step 5b.
- **>50 strings AND >2 modules** → proceed to parallel dispatch (Step 4).

This threshold avoids the overhead of worktrees + tmux for small projects.

### Step 4 — Parallel dispatch (Phase 3-4)

For each module in the `module-split`, invoke a `translator` in **parallel-batch mode** via worktree + tmux:

```
For each module:
  Invoke translator with:
    mode: parallel-batch
    feature: {feature-name}
    glossary: docs/glossary.md
    i18n-config:
      framework: {from Step 2}
      library: {from Step 2}
      key-convention: {from Step 2}
      interpolation-syntax: {from Step 2}
    namespace: {module namespace}
    files: {list of files in this module's directory}
    locale-dir: {from Step 2}
    source-language: es
    target-language: en
```

**Rules:**
- Launch ALL modules in the same message (parallel Task tool calls) if ≤5 modules. If >5 modules, batch into rounds of 5 (concurrency cap).
- Each translator writes locale fragments (`{namespace}.en.json`, `{namespace}.es.json`) and modifies only its assigned files.
- Each translator returns a status block with `strings-translated`, `files-modified`, and any `issues`.

**Gate per batch:** if any translator returns `status: failed`, read its report, diagnose, and re-invoke that single batch (max 2 retries). Other successful batches are NOT re-run.

### Step 5 — Merge + Build verify (sequential)

After ALL parallel batches return `status: success`:

Invoke `translator` in **merge mode** via Task tool with:
- Feature name
- locale-dir: `{from Step 2}`
- glossary: `docs/glossary.md`
- Instruction: "Merge all locale fragment files (`{namespace}.en.json`, `{namespace}.es.json`) into final `en.json` and `es.json`. Delete fragments. Run the project build. Produce the final `00-translation.md` report with aggregated stats."

Gate: if build fails → translator fixes, max 2 retries. If still failing → report to user with build error.

### Step 5b — Sequential fallback (small projects)

If Step 3 decided to skip parallelism, invoke single `translator` in `translate-only` mode:
- Reads existing glossary and i18n setup
- Runs Phase 3 → Phase 4 → Phase 5 sequentially
- Writes final `00-translation.md`

Gate: if build fails → re-invoke with error, max 2 retries.

### Step 6 — Report to user

Present:
- Summary: strings translated, files modified, glossary terms, modules processed
- Parallelism: N modules in parallel / sequential fallback
- Glossary location: `docs/glossary.md`
- Locale files location: `{locale-dir}/en.json`, `{locale-dir}/es.json`
- Translation report: `workspaces/{feature-name}/00-translation.md`
- Next steps: review translations, add language switcher, configure locale detection

---

## Test Mode

When invoked with `Direct Mode Task: test`:

**Routing:** the user invokes `/th:test {feature}` (or "run tests for this feature"). The skill optionally detects frontend markers and includes `frontend_scope: true` in the payload.

### Payload fields consumed

| Field | Type | Source | Effect |
|-------|------|--------|--------|
| `feature_name` | string | skill | Locates `workspaces/{feature}/` |
| `frontend_scope` | bool | skill frontend detection | See bridge below |

### `frontend_scope` bridge

When the payload carries `frontend_scope: true`:

1. **Persist to `00-state.md`.** Write or update `frontend_scope: true` in `workspaces/{feature}/00-state.md § Current State`. Create the state file if it does not yet exist (use the minimal template: `phase: test`, `status: in_progress`, `frontend_scope: true`).
2. **Precedence vs. full-pipeline Phase 0a Step 7 value.** The two sources are ORed: if EITHER the payload flag OR the Phase-0a-derived value is `true`, `frontend_scope` is `true`. The skill-derived value never downgrades a pipeline-derived `true`.
3. **Pass into the tester invocation.** Include `frontend_scope: true` in the tester Task payload and append to the invocation instruction: "This is a frontend-scope task — apply the mandatory browser-test decision rule (tester.md Phase-0 step 3b); do NOT default browser-API/interaction AC to jsdom."
4. **Tester mode obligations.** The tester runs in authoring-equivalent mode. TESTING.md (R4) write and decision-log obligations apply — the tester must record its test-type decisions in `03-testing.md § Test-Type Decisions`.

When `frontend_scope` is absent or `false`, the tester is invoked without the flag and the browser-test decision rule is not applied.

### Flow

1. Check `workspaces/{feature}/02-implementation.md` and `workspaces/{feature}/01-plan.md` § Task List (AC) exist. If either is missing, warn the user and stop.
2. Extract AC from `01-plan.md` § Task List.
3. If no AC found, warn the user: "No acceptance criteria found in `01-plan.md § Task List`. Run `/th:define-ac {feature}` first."
4. If payload carries `frontend_scope: true`, execute the `frontend_scope` bridge (above) before invoking the tester.
5. Invoke `tester` (authoring mode) via Task tool, passing: feature name, workspaces path, AC list, `frontend_scope` flag (when true), and the instruction above.
6. Before reporting results, apply the two console-path readiness gates (mirrors of the full-pipeline checks at `orchestrator.md` Phase 2.7):
   - **A1-F3 — browser readiness:** when the tester's status block `warranted_types` contains `e2e` or `browser-mode` AND its findings report missing tooling or binaries, surface the proposed setup commands (e.g. `npx playwright install --with-deps`, dependency-add commands) directly in the result summary — NOT buried in `03-testing.md`. Do not skip silently. See `orchestrator.md` Phase 2.7 `**A1-F3**` for the canonical gate text and the exact operator prompt wording.
   - **A1-F4 — jsdom-only soft gate:** when `frontend_scope: true` AND the tester's decision log in `03-testing.md § Test-Type Decisions` records a browser-API or interaction AC that was routed to jsdom, emit the Hot Context note defined in `orchestrator.md` Phase 2.7 `**A1-F4**` directly in the result summary. This note is non-blocking. Do NOT emit it when all AC are pure-logic or unit-level with no browser-API/interaction mismatch in the decision log.
7. Report results to user.

---

## Test-Pipeline Mode

When invoked with `Direct Mode Task: test-pipeline`:

Full step-by-step instructions are in `ref-special-flows.md § Test Pipeline Flow`. This section documents the `frontend_scope` contract only.

### `frontend_scope` in test-pipeline

The test-pipeline skill detects frontend markers and may include `frontend_scope: true` in the payload. Handling mirrors the Test Mode bridge:

- Persist `frontend_scope: true` to `workspaces/test-pipeline/00-state.md § Current State` at Phase 0 setup (before any module-test dispatch).
- Precedence rule: logical OR of payload flag and any pipeline-derived value — neither source can downgrade the other.
- Thread `frontend_scope: true` into each `module-test` payload with the same one-line instruction: "This is a frontend-scope task — apply the mandatory browser-test decision rule (tester.md Phase-0 step 3b); do NOT default browser-API/interaction AC to jsdom."

### Console-path readiness gates (consolidation/report step)

At the consolidation and report step (see `ref-special-flows.md § Test Pipeline Flow` for the full sequence), apply the same two gates used in Test Mode:

- **A1-F3 — browser readiness:** when any module-tester status block reports `warranted_types` containing `e2e` or `browser-mode` AND findings include missing tooling or binaries, surface the proposed setup commands directly in the consolidated result summary. See `orchestrator.md` Phase 2.7 `**A1-F3**` for the canonical gate text.
- **A1-F4 — jsdom-only soft gate:** when `frontend_scope: true` AND any module's decision log records a browser-API or interaction AC routed to jsdom, emit the Hot Context note from `orchestrator.md` Phase 2.7 `**A1-F4**` in the consolidated result summary. Non-blocking; omit when no browser-API/interaction mismatch is present.

See `ref-special-flows.md § Test Pipeline Flow` for the full phase sequence, module splitting, and reporting contract.

---

## Apply-Review Mode

When invoked with `Direct Mode Task: apply-review`:

This is the explicit, on-demand entry point into the orchestrator's author-side
apply-review handling. It is a COMPLEMENT to the automatic, lifecycle-bound trigger
in `orchestrator.md § "PR Comment Incorporation — Apply-Review Disposition"`, not a
replacement. Both paths load the same shared disposition snippet
(`agents/_shared/apply-review-disposition.md`) and behave identically per comment.

### Step 1 — Resolve the PR

Extract the PR reference (`#N`, `N`, or URL) from the payload `PR:` field. If absent,
report `status: blocked` asking the operator for a PR reference.

### Step 2 — Pull fresh PR comments

Run `gh pr view {number} --comments` (or the gh-fallback path — see
`agents/_shared/gh-fallback.md § "Tier A — read PR comments"`) to fetch all current
reviewer comments. Read the PR diff for current code state.

### Step 3 — Apply the disposition to every comment

For each reviewer comment, apply `agents/_shared/apply-review-disposition.md` in full:
classify (Step 1), run the verification filter for CHANGE comments that delete or
loosen (Step 2), apply deletion discipline (Step 3), resolve the concern rather than
obey the instruction (Step 4), and emit the per-comment output (Step 5). Apply the
`agents/_shared/finding-connection.md` cross-check at Step 2.4. Do NOT restate the
disposition here — reference and follow it.

After producing the per-comment output, execute the thread actions defined in
`apply-review-disposition.md § Step 6`: reply to each inline thread with its
per-comment disposition, and resolve the thread WHEN Decision is APPLIED. Use the
`gh` / GraphQL commands documented in `agents/_shared/gh-fallback.md §§ "Tier B —
list review threads (map comment → thread id)"`, `"Tier B — reply to a review
thread"`, and `"Tier B — resolve a review thread"`.

### Step 4 — Report

Surface the per-comment dispositions to the operator, including the thread actions
taken (reply sent, thread resolved, or thread left open with the reason). Any code
changes that result are applied to the PR branch under the standard worktree +
branch-author discipline. This direct mode does NOT emit a STAGE-GATE STOP block —
it is a focused, on-demand action.
