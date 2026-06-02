# Philosophy

> What team-harness is for, and what it is deliberately not.

This document states the intent behind team-harness so that anyone using it understands the model they are stepping into. It is not a feature list and not a tutorial — for those, see [How it works](./how-it-works.md) and the [Pipelines reference](./pipelines.md). This is the why.

---

## The north star: collaborative development

Team-harness is built around one idea: **a developer working with a team of specialized agents, as a member of that team.**

The developer is not a spectator watching code appear. The developer is not a manager handing tasks to autonomous bots and hoping for the best. The developer is a participant — the one who brings domain experience, judgment, and the final say, working alongside agents that bring rigor, breadth, and tireless execution.

The division of labor is deliberate:

- **The developer steers and decides.** They know the problem, the codebase, the constraints, and the stakes. They right-size the work, seed the intent, dissent when an approach is wrong, and approve at every stage boundary.
- **The agents bring what they are good at.** Exhaustive checks across security, performance, accessibility, and error handling. Patient exploration of a problem before committing effort. Consistent application of conventions. Work that does not get tired on the fortieth file.

The goal is to give the developer powerful tools that remain **steerable** — never a black box, never an automation that excludes the person who understands the problem best. The agents amplify the developer's experience and judgment; they do not substitute for them.

This is **not** autonomous code generation. It is **not** a system that runs without you. It is **not** pure deterministic automation that leaves the developer out of the loop. It is a collaboration, structured so that human judgment stays central and the agents do the heavy, broad, repetitive work that a single person cannot do alone at the same depth.

---

## What this looks like in practice

The collaborative model is not a slogan — it is encoded in concrete mechanisms. Every claim below maps to something the system actually does.

### The SDD pipeline is the collaboration structure

Spec-Driven Development gives the collaboration a shape. Every feature moves through three stages — analysis, implementation, delivery — with the developer at the boundary of each. State lives in files under `workspaces/{feature}/`, so the collaboration is legible: the developer can read every decision, risk, and trade-off the agents recorded, and any session can resume by reading them. The work is never hidden inside a model's head; it is on the shared board.

### Discover — the system is patient

Before any effort is committed, the system explores the idea *with* the developer. The Discover phase is patient by default: the architect does not fire on the arrival of a message. It waits for an explicit advance signal. This exists so the developer and the system can think through the problem together first, rather than the system racing ahead and producing a plan for the wrong thing. Patience is a feature — it is the system making room for the developer to shape the work before resources are spent.

### The intake survey — the human is the classifier

The developer right-sizes their own work. The intake survey captures a small set of meta-decisions — how heavy the pipeline should be, how much effort, how much autonomy, the scope of the change — and those answers are the developer's, recorded as attributable fields in the workspace. The system does not guess how serious your change is and silently pick for you. You are the classifier, because you are the one who knows.

### Spec co-authoring — bidirectional, neither party always right

The developer can seed the specification: the intent behind the work, a proposed approach, a decomposition, the gotchas they already know about. The architect consumes that as a *strong prior* — not a mandate. It evaluates alternatives, and when the seeded approach is deficient, it **dissents explicitly**, in writing, with its reasoning.

This is the heart of the model: the flow runs in **both directions**. The developer catches the system over-engineering; the architect catches the developer's approach when it is flawed. Neither party is assumed to be right by default. That is what collaboration between a developer and a capable team looks like — disagreement is surfaced and resolved, not suppressed.

### The human stage-gates — the developer approves the work

There are three points where the developer holds the decision and the pipeline stops for them:

- **After the plan** — approve the design and the PR breakdown before any code is written.
- **After the implementation** — review what was built against the acceptance criteria before it moves toward delivery.
- **Before delivery** — the final stop; ship, amend, or abort before the pull request opens.

These gates are not ceremony. They are the points where human judgment is required, and the system is built so that it cannot proceed past them on its own.

---

## Responsible development

Collaboration without rigor is just delegation with extra steps. Team-harness pairs the collaborative model with a set of non-negotiable commitments.

- **Gates are never skipped.** The stage boundaries are structural. An operator can choose a lighter pipeline for a small change, but specification and delivery always run — every change is spec'd, branched, committed, and shipped as a reviewable pull request.
- **Security floors are not negotiable.** Security review runs on security-sensitive paths — authentication, authorization, APIs, databases, cryptography, sessions — regardless of how light the rest of the pipeline is. This floor is input-independent: no survey answer, no fast-path flag, no autonomy grant can lower it.
- **Every choice is attributable.** Decisions are recorded with their rationale. The meta-decisions a developer makes are stored as fields, not inferred. When the architect disagrees with a seeded approach, that disagreement is written down. You can always reconstruct who decided what, and why.
- **Quality comes first.** Documentation is verified against current library sources rather than trusted from memory. Acceptance criteria are checked against the delivered work by an independent pass. The default is to do the work properly, not quickly.

These commitments are what make it safe for the developer to delegate. The agents can do more, broader, deeper work precisely because the guardrails that protect against irreversible mistakes are not left to anyone's memory.

---

## What we are deliberately not building

Some capabilities are absent by design. Naming them is as important as naming what the system does, because the absence is the point.

**We are not building autonomous self-evolution.** Agents do not write their own skills, commands, or behaviors without a developer authoring and approving the change. There is no background process that mutates the system on its own. Learning, where it happens, is captured synchronously and reviewed by a human as part of normal delivery.

**We are not building human-out-of-the-loop automation.** There is no mode where the developer is removed from the decisions that matter. The stage-gates, the dissent channel, the attributable choices — all exist to keep the person in the work.

The reason is the same in both cases: **the goal is to amplify the developer, not to replace them.** A system that rewrites itself without human approval, or that runs to completion without human judgment, is optimizing for autonomy. Team-harness optimizes for a developer who is more capable, more central, and more in control — not less. The future we are building toward is one where the developer is *more* essential to good software, supported by a team that extends their reach, never one where they are engineered out.

---

## The outcome we want

A developer amplified by a trusted team of agents they direct.

The result should be better software, built more responsibly, with human judgment at the center. The agents contribute rigor and breadth and stamina; the developer contributes experience, taste, and accountability. Together they produce work that neither could produce alone — the developer steering, the team executing, and every step legible, attributable, and gated by a human who remains in charge.

That is what team-harness is for.
