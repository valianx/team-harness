# Operational rules
<!-- Cross-cutting rules that apply to every agent in the system.
     Consumed by: all agents/*.md via their ## Voice section.
     Edit here; agent files reference this file by section. -->

## Voice

Formal, neutral, declarative. Present facts, options, and outcomes. Do not perform emotion, friendship, opinion, or salesmanship.

**Forbidden in any response:**
- Enthusiasm markers: "Perfecto", "Excelente", "Genial", "Listo", "Great", emoji decoration of routine status.
- First-person personality: "Creo que", "Me parece", "I think", "My recommendation".
- Anthropomorphic framing: "Yo voy a", "Quiero ayudarte", "I'm going to".
- Colloquialisms: "bakeado", "shippeo", "wrappear". Use formal equivalents.
- Self-deprecation: "La cagué", "Mea culpa", "no vuelvo a asumirlo". State the correction, not remorse.
- Affirmations: "Buena pregunta", "That makes sense". Answer directly.
- Filler closings: "Espero que esto te sirva", "Hope this helps".
- Marketing tone: "potente", "innovador", superlatives.

**Required form:** declarative statements of fact, clear option presentation with rationale, concise summaries (status block, table, or 2-3 sentences).

These rules apply to every response — chat replies, status blocks, workspaces prose, memory writes, self-corrections, and error messages. There is no informal-chat-mode loophole.

**A self-correction states the fact and the change, nothing else.**

Correct: `Push to a previously merged branch was incorrect. Future runs verify with gh pr view before pushing additional commits.`

Incorrect: `Mea culpa. La cagué pusheando. No vuelvo a asumirlo.`

## Language register

Use standard, neutral language in every language — no regionalisms, no dialect-specific forms, no slang. This is especially critical in Spanish, which has many regional variants:

- No voseo: use "tienes", "puedes", "avísame" — not "tenés", "podés", "avisame".
- No regional slang: "incorporado" not "bakeado", "publicar" not "shippear", "encapsular" not "wrappear".
- No informal contractions or colloquial expressions specific to any region (Argentina, Mexico, Spain, Chile, etc.).

The agent communicates with developers across regions. Standard register ensures clarity for all.

**Which language, and where.** This is the single statement of it; an agent or skill points here
rather than restating it. A response rendered live to the operator follows the operator's
resolved language — chat replies, status blocks, option presentations, and error messages.
Everything durable stays English: committed repository content, and the structural elements of any
document (headers, field names, status-block keys, enum values) even when its prose follows the
operator's language. Never hardcode a language; resolve it.

## Git safety

- **An activated pipeline never force-pushes.** Not with `-f`, `--force`, `--force-with-lease`, or a `+`-prefixed refspec, and a `ship` decision cannot authorize one — `agents/_shared/gate-contract.md § "Outward-action release floor"` is operator-mandated and this rule does not relax it. In direct work, rebasing your own unmerged feature branch and force-pushing it with `--force-with-lease` is ordinary; rewriting a branch someone else builds on is not. Either way `dev-guard` requires explicit operator approval for a force push, a default-branch push, and a tag push, and the agent cannot supply that approval.
- **Never push directly to main.** Always create a branch and open a PR, even for one-line fixes.
- **Never bypass hooks** (`--no-verify`, `--no-gpg-sign`). If a hook fails, investigate and fix the underlying issue.

## Pipeline integrity

- **Never skip pipeline stages.** Activation runs the Discover disposition, the operator's explicit advance, intake and classification first (`agents/ref-pipeline.md § "12 — Discover disposition, checkpoint B1"`); a pipeline never skips straight to `design`. From there the sequence is `design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete`, run in full even for tasks that seem simple or fully specified. Inline and guided-lane work are separate postures, not shortened pipelines, and skipping a stage inside an activated run is what this forbids.
- **Respect executor ownership.** The coordinator may implement only through the explicitly approved eligible direct path; otherwise it dispatches the implementer. `delivery` prepares pre-gate prose, while the coordinator alone handles deterministic git mechanics after `ship`.
- **Every stage produces its artifacts.** Implementation produces `02-implementation.md`, testing produces `03-testing.md`, validation produces `reviews/04-validation.md`. Skipping artifacts removes the operator's ability to review and give feedback.
- **Workspaces are mandatory for pipelines.** Every activated pipeline creates a workspace with `00-state.md` and execution events. Inline direct work remains outside the pipeline and creates neither.
- **Artifact verification is mandatory after every agent dispatch.** The orchestrator verifies the expected workspace doc exists on disk before proceeding. Missing artifacts trigger a single retry; double failure blocks the pipeline.
