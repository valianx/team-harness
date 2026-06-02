# Roadmap

> What we are building next — the sequenced path toward the [Vision](./vision.md).

The [Vision](./vision.md) names the destination: a team of developers, each amplified by a trusted team of agents they direct, working together as one. This document is the path to it — the concrete next steps, in the order we intend to take them, and the boundaries we will not cross. Where the vision is the destination, this roadmap is the route.

Every item below is grouped by status — shipped, next, decision pending, internal hardening, or deliberately not building — and each carries three things: what it is, *why* it earns a place on the path (tied back to the vision), and roughly the team-harness-native form it would take. Two kinds of "why" recur, and the roadmap keeps them distinct, because the vision does:

- Items that **protect the collaboration** turn a guarantee that currently lives as prose the model is asked to remember into a deterministic floor that runs regardless of how the model behaves. They do not reduce the developer's control; they protect the work from the irreversible mistakes that hurt most, so the developer can delegate with less manual auditing.
- Items that **enhance the collaboration** widen the surface where the developer and their agent team work together — a more specialized teammate to consult, a shared measure to negotiate over. They feed the developer's decision; they never replace it.

The selection below is informed by a survey of guardrail and review practices across agent-development systems, adapted to what is native to this harness and to the one line that does not move: as the system grows more capable, the developer grows *more* essential to good software, never less.

---

## Status legend

| Status | Meaning |
|--------|---------|
| **Shipped** | In the released product today. Listed for context, so the path has a starting point. |
| **Next** | The first batch. Native to the stack, no infrastructure assumptions, no cost or philosophical tension. Building order is set. |
| **Decision pending** | A genuine trade-off the team must weigh before committing. Not deferred for capacity — open by design. |
| **Internal hardening** | Improvements to the harness's own pipeline, drawn from running it on itself. |
| **Deliberately not building** | The boundary. Named because the boundary is what defines the product. |

---

## Shipped — the starting point

### Cost visibility in tokens and USD

**What it is.** A per-pipeline `## Cost` rollup, a `/th:trace --cost` surface, and a `pricing` key in `~/.claude/.team-harness.json` that turns token counts into dollar figures. Cost is derived at render-time from `phase.end` token counts multiplied by the pricing table, rather than persisted as a dollar field — so when prices change, the figure recalculates correctly instead of going stale.

**Why (protects the collaboration).** Knowing what a pipeline costs is part of the developer deciding the scope and weight of a change with full information rather than guessing blind. Cost visibility is the precondition for the cost-sensitive decisions further down this roadmap to be made deliberately.

**Form.** Shipped in v2.43.0. The only remaining step is operator-side: populate `pricing.opus` / `pricing.sonnet` / `pricing.updated`. Without it, every cost surface degrades gracefully to tokens-only with a note. Connecting estimated cost into the Discover phase — so the developer sets scope while *seeing* the cost — is a natural future enhancement, not outstanding debt.

---

## Next — the first batch

These four are native to the harness, carry no infrastructure assumptions, and have no cost or philosophical tension. The first two protect the collaboration; the last two enhance it. Building order is set.

### 1. Pre-push secret scanning

**What it is.** A scan of the staged diff for credential patterns — provider key prefixes, embedded private-key blocks, credentials in URLs, long bearer tokens — that runs before any push. Today the harness blocks *writes to sensitive file paths* (`.env`, `.pem`, and similar) by path, but it does not scan the *content* of a diff for a secret that landed in an otherwise innocent file.

**Why (protects the collaboration).** This harness exists to publish pull requests. A secret that slips into a delivery commit on a public repository is exactly the class of irreversible mistake the working agreements already forbid in prose. Turning that rule into code that runs regardless of how the model behaves is the most direct way to let the developer delegate delivery without auditing every diff by hand — and, distributed across a team, it means every developer's pipeline upholds the same floor rather than each relying on their own diligence.

**Form (team-harness-native).** A `PreToolUse` hook plus a delivery step, mirroring the existing `policy-block.sh` hook: bash + Python, cross-platform, a closed catalog of patterns, a fixture allowlist replicated from the existing path exclusions. Lowest effort of the batch, highest on-brand, no dependencies — so it goes first.

### 2. Machine validation of pipeline state and events

**What it is.** Synchronous JSON-Schema validation of the JSONL event stream the orchestrator writes, plus front-matter validation for `00-state.md`, surfaced through a `/th:trace --validate` mode. The events already have a documented schema; this enforces it at the point of writing instead of trusting human or agent reading at review time.

**Why (protects the collaboration).** The recorded state is the pipeline's source of truth — the shared board the developer reads and another developer reviews later. Drift in it produces gates that fail open and progress that over-claims. The harness's own history makes the case: reviewers caught count drift by hand more than once, and a specific contract exists today precisely because a silently-zeroed token count once broke the cost rollup. Validating at the write point catches that class of defect where it happens, not in review.

**Form (team-harness-native).** The orchestrator is the *sole* writer of the event stream, so validation is a synchronous step it runs before each append — not a fragile on-write parse hook (the runtime exposes no on-write trigger for an editor's write to a markdown file, so chasing one would be brittle). The JSONL substrate, which already has a documented schema, comes first; `00-state.md` front-matter validation follows as a second phase through the same synchronous step. Start non-blocking — a warning in `/th:trace --validate` — and promote to a hard gate only after observing zero false positives, because the harness has never blocked on internal state and a hard gate without that data would be risky for recovery flows.

### 3. Specialized analyzer passes as agent teammates

**What it is.** Dedicated review lenses with closed catalogs — a silent-failure pass (empty catch blocks, swallowed errors on critical paths, missing timeout or rollback) and a type-design pass (illegal states made unrepresentable) — added to the existing reviewers. Today these checks exist as a single bullet inside a broad generic review whose attention is split across correctness, security, performance, and error handling at once.

**Why (enhances the collaboration).** A specialized pass does not take a decision away from the developer — it hands them a teammate of higher resolution to consult, the same way they already consult the reviewer. A silent failure is the class of bug a broad sweep dilutes: a swallowed error on a critical path looks innocent in a diff. Codifying "these patterns are always bugs" into a dedicated pass is leverage on the developer's experience, and the finding feeds their decision rather than replacing it. The agent team gains a specialist; the developer gains someone to consult.

**Form (team-harness-native).** Reuse the existing reviewer-lens pattern — the harness already carries a dedicated specialized-pass lens in the reviewer, so this replicates a proven shape as closed-catalog sub-sections in the reviewer and security prompts, with a shared snippet if both consume the same catalog. Prompt-contract lenses, not new standalone agents, keep this native and cheap to maintain.

### 4. A harness self-audit scoreboard (`/th:audit`)

**What it is.** A standalone skill that scores the harness's own health against a versioned rubric — categories like guardrail coverage, model/effort consistency, structural-test coverage, observability health, and fail-closed coverage — and persists each score so successive versions can be compared. **Measurement only.**

**Why (enhances the collaboration).** Improving the harness has been blind: a multi-phase improvement program ran without a single number that said whether the result was a better harness than the version before it. A shared, versioned scoreboard is the channel through which *developers* direct improvement — a common language the developer and their agent team read together to negotiate what to change next cycle, and one the human team can speak among themselves about the tooling they all share. The developer sees "fail-closed coverage dropped from 9 to 7" and directs the team to fix it.

**Form (team-harness-native).** A standalone skill (the `/th:lint` shape — it does not route through the orchestrator) with a versioned rubric and per-version score persistence. It *invokes* the existing per-agent evaluation as one of its categories rather than replacing it.

> **Explicitly not a self-tuning optimizer.** This item measures and reports; it never modifies the harness. A loop that measures, applies a change, and re-measures on its own would take the developer out of the improvement decision — the opposite of what the scoreboard is for. The score is the channel through which the human directs the change, with the agents executing and the human deciding what is worth changing. That invariant is part of the item, not a footnote to it.

---

## Decision pending — the one genuine trade-off

### Selective dual-model-family review on high-risk changes

**What it is.** For the changes where a mistake is expensive — authentication, payments, migrations — a second, independent agent perspective from a different model family before the developer commits. The second perspective offers a verdict and findings only; it never writes code. A disagreement between perspectives would not block — it would escalate to the developer at the final gate, both verdicts in hand.

**Why (enhances the collaboration).** Two independent perspectives before a commit widen the developer's decision rather than substituting for it. On a high-risk change, decorrelating errors across model families catches the bug a single family's shared bias misses, and surfacing a disagreement *to the human* — rather than auto-resolving it — is collaboration widened, not automation added. The developer decides *with* two opinions.

**Why it is a decision and not a default.** A second reviewer on *every* change reintroduces exactly the cost and latency a recent optimization program worked to remove, and a dependency on external model CLIs the operator may not have installed. As a selective net for high-risk paths it enriches the decision genuinely; as a gate on everything it becomes expensive machinery the developer learns to ignore. The resolution is not technical — it is the team's call on how much high-risk cost a second perspective is worth. The roadmap frames the trade-off; it does not pre-decide it.

**Form (team-harness-native, if adopted).** A conditional step triggered only by the existing high-risk signals (the security-sensitive flag, the critical bug-fix tier, breaking migrations). The external perspective receives the diff and returns text — never a write tool — and degrades gracefully with a note when no external CLI is present, following the harness's existing graceful-degradation pattern. The disagreement-escalates-to-the-human rule keeps the developer at the center.

---

## Internal hardening — from our own pipeline experience

These are improvements to the harness's own pipeline, surfaced by running it on itself.

### Fix the nested design-only dispatch path

**What it is.** When the orchestrator runs design-only from a nested context, it must never self-author the plan or defer the plan-review panel. The producing agent always owns the plan, and the review panel always runs.

**Why (protects the collaboration).** A plan the orchestrator wrote for itself, or a review panel that quietly did not run, breaks the legibility and the human stage-gate the whole collaboration rests on — the plan must be owned by the agent that produced it and reviewed before the developer approves it. This is being addressed next.

### Wire a before/after quality measurement for the architect effort change

**What it is.** A measured comparison of harness quality before and after the architect's effort setting was raised, to confirm the bet paid off rather than assuming it.

**Why (enhances the collaboration).** A tuning change made without a measurement is exactly the blind improvement the scoreboard exists to end. This depends on the self-audit scoreboard (item 4 above) and is planned to follow it.

---

## Deliberately not building toward

Naming the path requires naming where it stops, because the boundary is what defines the product. These are not items deferred for capacity — they are directions we refuse, consistent with the vision.

### Autonomous self-evolution

There is no future on this path where agents write their own skills, commands, or behaviors without a developer authoring and approving the change, and no background process that mutates the system on its own. The mechanics by which a recorded insight *strengthens as it proves useful and fades when it does not* are compatible with the vision — memory may learn — but the system does not rewrite itself. A human-gated confidence-and-decay refinement of the shared Knowledge Graph is the only piece of this family even under consideration, and it sits at the lowest priority: its collaborative value is marginal next to the specialized teammates and the scoreboard, and any version that required native backend support would cross a repository boundary. A self-writing loop and a background daemon are rejected outright — they assume infrastructure this harness deliberately does not have *and* they remove the developer from the decisions that define the work.

### A large deterministic-hook expansion

It is tempting to read "the harness wires only a couple of hook events" as "the harness is missing many hooks." It is not. The runtime exposes a *fixed, small* set of hook events, and the harness already prunes the noisy ones on purpose. Most of a large hook expansion assumes event families the runtime does not expose, and the one learning-capture hook that *would* matter has no matching event and would feed the autonomous loop rejected above. The single genuine fit is one formatting hook on the one unused event — it runs in the consumer repository after an edit, is a no-op when no formatter is declared, and rides along with the secret-scan and event-validation scripts. That formatting hook is in scope; "many more hooks" is not. Keeping the expectation honest is part of the boundary.

---

## How we sequence this

The order follows one principle: protect the collaboration first, then enhance it, then weigh the cost-sensitive items by explicit decision.

1. **Guardrails first — protect the collaboration.** Pre-push secret scanning, then machine validation of the JSONL event stream. These are the deterministic floors that close the irreversible-mistake gaps the harness's own history shows hurt most. Lowest effort, no dependencies, no tension.
2. **Then the collaboration-enhancing teammates and the scoreboard.** The specialized analyzer passes give the developer a higher-resolution teammate to consult; the self-audit scoreboard gives the developer and their agents a shared language for directing improvement. Both are native, and the scoreboard's value does not wait on accumulated history — the comparison data builds for free once it is in place.
3. **Then the cost-sensitive item, by explicit decision.** Selective dual-model-family review on high-risk changes enriches the decision genuinely, but it touches the cost envelope a recent optimization program worked to protect. It is a deliberate per-change choice for the team to make, not a default the roadmap sets.

The internal-hardening items land alongside the batch as the harness's own pipeline reveals the need; the boundary items stay where they are. Every step on this path ties back to the same line: the developer more central, supported by agents that extend their reach, never one where they are engineered out.

---

## See also

- [Vision](./vision.md) — the destination this roadmap sequences a path toward.
- [How it works](./how-it-works.md) — the pipeline as it runs today.
- [Pipelines reference](./pipelines.md) — the full set of pipelines, tiers, and gates.
