# Vision

> Where team-harness is headed — a team of developers, each amplified by a trusted team of agents they direct, working together as one.

This document describes the destination: what team-harness is building toward and what we want it to become. It is not a feature list and not a tutorial — for those, see [How it works](./how-it-works.md) and the [Pipelines reference](./pipelines.md). Some of what follows exists today; the rest is the direction we are deliberately building toward, and the text marks the difference plainly.

---

## What we are building toward

A team of developers, each working with their own trusted team of specialized agents — directing them, deciding with them, and producing better and more responsible software than any of them could produce alone.

That is the destination, and it has two nested levels. At the individual level, each developer is a member of a team of agents: they bring domain experience, taste, and the final say; the agents bring rigor, breadth, and tireless execution. At the collective level, those developers are themselves a team — many people, each amplified by their own agents, working together so that the amplification compounds into a coherent, shared way of building rather than a set of isolated individuals each with their own bots. This is what the name means: team-harness is distributed to a whole development team, not to a lone operator.

It is not a system that writes code while a developer watches, and not a fleet of autonomous bots handed a task and left to run. The aspiration is a *team* whose reach is extended in every direction — each person more capable, more central, and more in control, and the team as a whole sharing what it learns and how it works — with human judgment, individual and collective, kept firmly at the center of the work.

Everything below describes that end-state and the path to it. The single line that does not move: as the system grows more capable, the developers grow *more* essential to good software, never less.

---

## The path: collaborative development

The foundation already exists. Team-harness is built around one idea — a developer working alongside agents as a member of the team — and that idea is encoded in concrete mechanisms, not slogans. The same mechanisms that make one developer's work legible are what let it flow into the wider human team, so the two levels are built on the same foundation rather than two separate systems.

- **Spec-Driven Development gives the collaboration its shape.** Every change moves through three stages — analysis, implementation, delivery — with the developer at the boundary of each. State lives in files under `workspaces/{feature}/`, so the work is legible: every decision, risk, and trade-off is on a shared board the developer can read, never hidden inside a model's head. That legibility is also what makes the work reviewable by *another* developer later — the same property serves both the individual and the team.
- **The developer engages before the system commits.** The Discover phase is patient by default — it waits for an explicit advance signal rather than racing ahead and planning the wrong thing. The developer and the system think through the problem together first.
- **The developer right-sizes their own work.** A short intake survey captures the meta-decisions — how heavy the pipeline should be, how much effort, the scope of the change — as attributable fields. The system does not silently guess how serious a change is; the developer is the classifier, because they are the one who knows.
- **Spec co-authoring runs in both directions.** The developer can seed the intent, an approach, the gotchas they already know. The architect treats that as a strong prior, not a mandate — and when the seeded approach is deficient, it dissents explicitly, in writing. Neither party is assumed right by default. Disagreement is surfaced and resolved.
- **Three human stage-gates hold the decisions that matter.** After the plan, after the implementation, and before delivery, the pipeline stops for the developer to approve, amend, or abort. These are not ceremony — they are the points where human judgment is required, and the system cannot proceed past them on its own.

This is the trusted foundation. The destination is reached by deepening it — extending each developer's reach without moving them off-center, and letting that amplification compound across the team.

---

## From a developer to a team

The mechanisms above describe one developer working with their agents. But team-harness is not built for a lone operator — it is distributed to a whole development team, and the vision holds two nested levels at once.

**The individual level: a developer and their agent team.** Each developer directs their own team of specialized agents — the architect, the implementer, the reviewers, the delivery agent. This is the collaboration the rest of this document describes: the person steers and decides; the agents bring rigor, breadth, and stamina.

**The collective level: developers as a team.** Those developers are themselves a team. The intent is not isolated individuals who each happen to have bots, but a group whose individual amplification adds up to a coherent, shared way of working. Three mechanisms make that real, and each is something the system already does rather than a slogan.

- **The team gets smarter together, not in silos.** When a pipeline finishes a task, the delivery agent persists what was learned — a non-obvious constraint, a convention that emerged, an anti-pattern avoided — to a Knowledge Graph the team shares: an external memory service, not a per-machine file. The capture is passive: no one curates it; it is synthesised from the session that just completed. So what one developer's pipeline discovers becomes searchable by every other developer's agents on future work. The graph is technical-only by policy — patterns, gotchas, decisions, and inventories, never personal data, preferences, or names — which is exactly what makes it safe to circulate between people.
- **Everyone works the same way.** The same pipeline, the same conventions, and the same agents are distributed across the whole team. A developer's agent team in one person's checkout behaves the same as another's, because both are running the same harness against the same recorded conventions. The output is coherent and reviewable across the team — a shared standard, not a patchwork of individual styles that no one else can pick up.
- **Legible, attributable work is the connective tissue.** Recording every decision in the workspace and shipping it as a reviewable pull request with attributable rationale is not only for the developer who did the work. It is precisely what lets *another* developer — and their agents — pick the change up, review it, build on it, and trust it. Individual legibility is the thing that makes team collaboration possible: you cannot collaborate on work you cannot read, and you cannot build on a decision whose reasoning was never written down.

The two levels reinforce each other. Each developer's agents extend that person's reach; the shared knowledge, the shared conventions, and the legible record turn many amplified individuals into one team that builds coherently and learns as a unit. The human stays central at both levels — each person's judgment on their own work, and the team's collective judgment on the work it shares.

---

## Where this is going

The collaboration today is real, but some of what makes it safe still lives as prose the model is asked to remember, and each developer's agent team is capable rather than specialized. The direction we are building toward closes both gaps — and every step ties back to the developers being more central, never less.

### Confidence to delegate

Today some critical guarantees are written as rules the model must recall: do not commit a secret, do not let the pipeline's recorded state drift out of sync. The direction is to turn those guarantees into deterministic floors that run regardless of how the model behaves — a secret scanned out of the diff before any push, the pipeline's machine-readable state validated against its schema at the point it is written. These floors do not reduce the developer's control. They protect the collaboration from exactly the irreversible mistakes that hurt most, so the developer can delegate with less manual auditing — letting go of the wheel on the stretches where human judgment adds nothing, precisely because a guardrail, not memory, is holding the line. Distributed across the team, a deterministic floor also means every developer's pipeline upholds the same guarantee, rather than each relying on their own diligence.

### A more capable agent team, and a shared language for improving it

Each developer's agent team becomes more specialized. Where review attention is spread today across correctness, security, performance, and error handling at once, the direction is to add specialized teammates the developer consults the same way they already consult the reviewer — a dedicated pass that catches the class of silent failure a broad sweep dilutes. The finding feeds the developer's decision; it does not replace it.

Alongside the agent team, a shared scoreboard. The direction is a versioned measure of the harness's own health that developers and their agents read together to negotiate what to improve next cycle — a common language for co-improvement, and one the human team can speak among themselves about the tooling they all share. This is the opposite of a system that tunes itself without telling anyone: the score is the channel through which *developers* direct the improvement, with the agents executing and the humans deciding what is worth changing.

### Independent perspectives on high-risk changes

For the changes where a mistake is expensive — authentication, payments, migrations — the direction is to give the developer a second, independent agent perspective before they commit. A disagreement between perspectives would not block; it would escalate to the developer at the final gate, both verdicts in hand, so the decision is made with more information rather than less. The developer decides *with* two opinions — collaboration widened, not automation substituted.

---

## What we are deliberately not building toward

Naming the destination requires naming where we refuse to go, because the boundary is what defines the product.

**We are not building toward autonomous self-evolution.** There is no future in which agents write their own skills, commands, or behaviors without a developer authoring and approving the change, and no background process that mutates the system on its own. Memory may learn — the mechanics by which a recorded insight strengthens as it proves useful and fades when it does not are compatible with this vision — but the system does not rewrite itself.

**We are not building toward human-out-of-the-loop automation.** There is no destination where the developer is removed from the decisions that matter. The stage-gates, the dissent channel, the attributable choices exist to keep the person in the work, and the direction deepens them rather than dissolving them. The same holds at the team level: shared knowledge and shared conventions are there to inform human decisions, never to make them automatically.

The reason is the same in both cases, and it is a directional commitment rather than a passing principle: the future we want is the developers *more* essential, each supported by agents that extend their reach and together sharing what they learn — never one where they are engineered out. A system that rewrites itself without human approval, or runs to completion without human judgment, is optimizing for autonomy. Team-harness is built to optimize for developers who are more capable, more central, and more accountable. That is the line that does not move.

---

## Where this leads

A team of developers, each amplified by a trusted team of agents they direct, working together as one.

The outcome is better software, built more responsibly, with human judgment — individual and collective — at the center. The agents contribute rigor, breadth, and stamina; the developers contribute experience, taste, and accountability. Together they produce work that none of them could produce alone — each developer steering their own agents, the team sharing what it learns and how it works, every step legible and attributable, and every decision that matters held by a human who remains in charge.

As the system grows more capable, the developers become more essential, not less — and the team builds more coherently than any of them could alone. That is where team-harness is headed.
