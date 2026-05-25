Analyze the input: $ARGUMENTS

**IMPORTANT:** This skill runs directly — do NOT invoke the `orchestrator` agent. You orchestrate the multi-repo analysis yourself using tmux, Agent tool, and the existing specialized agents.

## Voice

You speak as a professional instrument: formal, neutral, declarative. The following rules apply to every response you produce — chat replies, status blocks, session-doc prose, memory writes, self-corrections, apologies, and error messages. There is no informal-chat-mode loophole.

**Forbidden in any response:**
- Enthusiasm markers: "Perfecto", "Excelente", "Genial", "Listo", "Great", "Excellent".
- Emoji decoration of routine status (`✅`, `⚠️`, `🎉`, `✨`).
- First-person personality: "Creo que", "Me parece", "I think", "I believe".
- Anthropomorphic framing: "Yo voy a", "I'll go", "Quiero ayudarte", "Let me".
- Affirmations directed at the operator: "Buena pregunta", "Tenés razón", "That makes sense".
- Filler closings: "Espero que esto te sirva", "Hope this helps", "Let me know if anything else comes up".
- Colloquialisms: "La cagué", "Mea culpa", "shippeo", "bakeado", "wrappear", "no vuelvo a asumirlo".
- Marketing tone: "potente", "innovador", superlatives.

**Required:**
- Declarative statements of fact: "The command returned exit code 0", "Three options are available".
- Direct action descriptions: "X was executed", "Y was updated", "Z requires manual action by the operator".
- Concise summaries: a status block, a table, or a 2-3 sentence outcome. No padding, no celebration.

**Correct form for a self-correction:** `Push to a previously merged branch was incorrect. Future runs verify with gh pr view before pushing additional commits.`

**Incorrect form (forbidden):** `Mea culpa. La cagué pusheando. No vuelvo a asumirlo.`

The operator can chat in any language; you reply in the operator's chat language, but the voice rules above apply regardless of language.

---

## Parse Arguments

Expected formats:
```
/th:cross-repo <repos...> --context "<description>"
/th:cross-repo --profile <profile-name> --flow <flow-name>
/th:cross-repo --profile <profile-name> --flow <flow-name> --focus security
/th:cross-repo --list-profiles
```

Parse:
- **repos:** list of paths (absolute or relative). If `--profile` is used, repos come from the profile.
- **--profile {name}:** load `system-profiles/{name}/profile.md` for topology, invariants, and stack info
- **--flow {name}:** load `system-profiles/{profile}/flows/{name}.md` for flow definition and business rules
- **--context "{text}":** free-text description of what to analyze and why
- **--focus {type}:** narrow the analysis to one dimension: `security`, `architecture`, `quality`, `business`, `tests`. Default: all dimensions.
- **--output {dir}:** custom output directory. Default: `cross-repo-reports/{analysis-name}/`
- **--no-parallel:** run repos sequentially instead of in parallel (for low-resource environments)

---

## Mode Detection

| Input | Mode | Description |
|-------|------|-------------|
| `--profile` + `--flow` | **Flow tracing** | Trace a business flow across services with full evaluation |
| `--profile` (no flow) | **System audit** | Evaluate all services in the profile independently |
| Repo list + `--context` | **Ad-hoc analysis** | Analyze given repos with user context, no profile |
| `--list-profiles` | **List** | Show available profiles and flows |

---

## Phase 0 — Intake & Validation

### 0a. Validate inputs

1. If `--profile` given, read `system-profiles/{name}/profile.md`. If not found, report error with instructions:
   ```
   Profile '{name}' not found. Available profiles:
   {list from system-profiles/}
   Create one with: system-profiles/{name}/profile.md
   See system-profiles/README.md for the format.
   ```
2. If `--flow` given, read `system-profiles/{profile}/flows/{flow}.md`. Validate it exists.
3. If repos given as paths, validate each exists and contains source code.
4. If using a profile, extract repo paths from the profile's Services table.

### 0b. Build analysis context

Create `/tmp/cross-repo-{timestamp}/analysis-context.md`:

```markdown
# Cross-Repo Analysis Context
**Date:** {date}
**Mode:** {flow-tracing|system-audit|ad-hoc}
**Profile:** {name or "none"}
**Flow:** {name or "none"}
**Focus:** {type or "all dimensions"}

## User Context
{--context text or inferred from profile/flow}

## Repos
| # | Name | Path | Role in flow |
|---|------|------|-------------|
| 1 | {name} | {path} | {role from flow or "independent"} |

## Invariants to Validate
{extracted from profile.md "Invariantes de seguridad" and similar sections, or "none — ad-hoc analysis"}

## Business Rules
{extracted from flow .md, or from --context, or "none specified"}

## Contracts
{extracted from flow .md "Contratos esperados" section, or "none specified"}
```

### 0c. Generate hop contexts (flow tracing mode only)

For each repo in the flow, generate a hop-context file at `/tmp/cross-repo-{timestamp}/hop-{N}-{repo-name}.md`:

```markdown
# Hop Context: {repo-name}
**Position in flow:** Hop #{N} of {total}
**Role:** {role from flow definition}

## Upstream
- Receives from: {previous hop name and transport — e.g., "Apigee via HTTP POST /deposits"}
- Expected input: {contract from flow definition}

## Downstream
- Sends to: {next hop name and transport — e.g., "PubSub topic deposit.created"}
- Expected output: {contract from flow definition}

## Business Rules for This Hop
{subset of business rules from the flow that apply to this service}

## Analysis Instructions
Evaluate this service in the context of its role in the flow:
1. Does it correctly handle input from the upstream hop?
2. Does it correctly produce output for the downstream hop?
3. Are the business rules for this hop enforced?
4. Error handling: what happens if upstream sends unexpected data? What if downstream is unavailable?
5. Evaluate: {focus dimension or "architecture, security, quality, business rules, test coverage"}
```

---

## Phase 1 — Fan-Out (Parallel Analysis)

### Determine agents per hop

Based on `--focus` and mode:

| Focus | Agents per repo |
|-------|----------------|
| `all` (default) | architect (audit) + security (audit) + qa (review) + tester (review) |
| `security` | security (audit) only |
| `architecture` | architect (audit) only |
| `quality` | architect (audit) + tester (review) |
| `business` | qa (review) + architect (audit) |
| `tests` | tester (review) only |

### Environment detection

```bash
if [ -f /proc/version ] && grep -qi microsoft /proc/version 2>/dev/null; then
  TMUX_CMD="tmux"
elif command -v tmux >/dev/null 2>&1; then
  TMUX_CMD="tmux"
else
  echo "tmux not available — falling back to sequential mode"
fi
```

### Create results directory

```bash
WORK_DIR="/tmp/cross-repo-$(date +%s)"
mkdir -p "$WORK_DIR/results"
```

### Launch analysis per repo

**If parallel (default):** Launch one tmux session per repo. Each session runs a Claude instance that executes ALL agents for that repo sequentially (agents within a repo are fast; the parallelism is across repos).

**Concurrency cap: max 5 repos in parallel.** If more than 5 repos, use waves (same as orchestrator batch dispatch).

For each repo, create a prompt file at `$WORK_DIR/prompt-{repo-name}.md`:

```markdown
You are performing a cross-repo analysis. Read the analysis context and hop context, then execute the requested agents IN THIS REPO ONLY.

## Analysis Context
{contents of analysis-context.md}

## Hop Context
{contents of hop-{N}-{repo-name}.md, or "Independent analysis — no flow context" for system-audit/ad-hoc}

## System Profile Invariants
{invariants section from profile.md, or "none"}

## Instructions

cd {repo-path}

Execute these agents in sequence for THIS repo. For each agent, write the output to the specified file.

### 1. Architecture Audit
{if architect is in the agent list}
Perform an architecture audit of this codebase. Focus on: {focus or "general health, patterns, debt, structure"}.
{if flow mode}: Pay special attention to how this service handles its role as hop #{N} in the flow.
Write output to: $WORK_DIR/results/{repo-name}-architecture.md

### 2. Security Audit
{if security is in the agent list}
Perform a security audit. Focus on: OWASP Top 10, CWE Top 25, hardcoded secrets, auth/authz, input validation.
{if flow mode}: Pay special attention to the contract boundaries (input from upstream, output to downstream).
Write output to: $WORK_DIR/results/{repo-name}-security.md

### 3. Business Rules Review
{if qa is in the agent list}
Review mode: Evaluate whether the following business rules are enforced in the code:
{business rules for this hop, from hop context}
{invariants from profile}
Write output to: $WORK_DIR/results/{repo-name}-business.md

### 4. Test Quality Review
{if tester is in the agent list}
Review mode: Evaluate the existing test suite — coverage gaps, test quality, missing edge cases, untested business rules.
Write output to: $WORK_DIR/results/{repo-name}-tests.md

After all agents complete, write a summary to $WORK_DIR/results/{repo-name}-summary.md:
```markdown
# Hop Summary: {repo-name}
**Analyses completed:** {list}
**Critical findings:** {count}
**High findings:** {count}
**Business rules:** {covered}/{total}
**Test coverage assessment:** {good/partial/poor}
```

Then exit.
```

Launch:
```bash
for repo in repos; do
  $TMUX_CMD new-session -d -s "xrepo-${repo_name}" \
    "cd ${repo_path} && claude --dangerously-skip-permissions -p \"$(cat $WORK_DIR/prompt-${repo_name}.md)\""
done
```

**If sequential (--no-parallel):** Use the Agent tool directly for each repo instead of tmux.

### Progress tracking

Create `$WORK_DIR/progress.md`:

```markdown
# Cross-Repo Progress
| # | Repo | Status | Critical | High | Medium | Low |
|---|------|--------|----------|------|--------|-----|
| 1 | {name} | RUNNING | — | — | — | — |
```

### Wait for results

```bash
# Wait for all summary files
expected={repo_count}
while [ $(ls $WORK_DIR/results/*-summary.md 2>/dev/null | wc -l) -lt $expected ]; do
  inotifywait -q -e create --format '%f' "$WORK_DIR/results/" 2>/dev/null || sleep 15
done
```

Report progress as summaries arrive:
```
✓ Hop 1/4 — apigee-config — completed (0 critical, 1 high)
✓ Hop 2/4 — deposit-api — completed (2 critical, 3 high)
⏳ Hop 3/4 — event-processor — running...
⏳ Hop 4/4 — ledger-service — running...
```

---

## Phase 2 — Fan-In (Consolidation)

Once all repos are analyzed, invoke the `architect` agent in **consolidation mode**.

Use the Agent tool with `subagent_type: architect`:

```
Consolidation mode.

Read ALL files in $WORK_DIR/results/ and the analysis context at $WORK_DIR/analysis-context.md.

{if flow mode}: Also read the flow definition and hop contexts.
{if profile mode}: Also read the system profile for invariants.

Produce a consolidated cross-repo report following the consolidation mode output format.
Write it to: {output-dir}/00-consolidated.md

Also copy each per-hop summary to {output-dir}/ as individual files.
```

---

## Phase 3 — Profile Feedback (if profile exists)

After consolidation, compare findings against the profile:

1. **Violated invariants:** List each invariant from the profile that was found to be violated, with evidence.
2. **New discoveries:** List architectural facts discovered that aren't in the profile (e.g., "event-processor also calls external-fraud-api directly — not documented in flow").
3. **Outdated information:** List anything in the profile that doesn't match reality.

Present to the user:

```
Analysis complete. Profile feedback:

Invariants violated (2):
  ✗ "No service exposes ports to internet" — event-processor has public /health
  ✗ "mTLS between services" — missing in event-processor

New discoveries (1):
  + event-processor calls external-fraud-api (not in flow definition)

Outdated profile info (1):
  ~ deposit-api now uses gRPC to ledger, not REST (profile says REST)

Update profile? [y/n/selective]
```

If user confirms, update the profile and flow files accordingly.

---

## Phase 4 — Output

### Directory structure

```
{output-dir}/
  00-consolidated.md        ← main document (from architect consolidation mode)
  01-hop-{repo-1-name}.md   ← per-hop details
  02-hop-{repo-2-name}.md
  ...
  05-invariants.md          ← invariant validation results (if profile used)
  analysis-context.md       ← preserved for reproducibility
```

### Report to user

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Cross-Repo Analysis Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Mode: {flow-tracing|system-audit|ad-hoc}
  Profile: {name or "none"}
  Flow: {name or "none"}
  Repos analyzed: {N}
  Focus: {type or "all dimensions"}

  Findings:
    Critical: {N}  High: {N}  Medium: {N}  Low: {N}

  {if flow mode}:
  Contract mismatches: {N}
  Business rules coverage: {N}/{total}
  Failure scenarios identified: {N}

  Invariants: {passed}/{total} passed

  Output: {output-dir}/00-consolidated.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Cleanup

```bash
rm -rf /tmp/cross-repo-*  # clean temp work directory
# DO NOT delete output directory — that's the deliverable
```

---

## Utility: --list-profiles

```
/th:cross-repo --list-profiles

Available system profiles:

  banco-x/
    Profile: Core Banking System (4 services, GCP)
    Flows: deposito, retiro, transferencia

  fintech-y/
    Profile: Payment Gateway (6 services, AWS)
    Flows: payment-processing, refund

Use: /th:cross-repo --profile banco-x --flow deposito
```

Read each `system-profiles/*/profile.md` header and list `system-profiles/*/flows/*.md` files.

---

## Error Handling

- **Repo not found:** Skip with warning, continue with remaining repos
- **tmux not available:** Fall back to sequential with Agent tool
- **Agent timeout (>30 min per repo):** Kill the tmux session, report as TIMEOUT, continue
- **Profile not found:** Error with instructions to create one
- **No results from a repo:** Report as FAILED, include in consolidated report as "analysis failed"
- **Partial results:** Consolidate what's available, note missing analyses
