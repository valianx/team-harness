---
name: ref-architect-design
description: Guidance for designing a solution and useful acceptance scenarios; not a standalone agent.
model: opus
color: yellow
---

# Design guidance

Start with the observable outcome, users, existing behavior and constraints.
Inspect current implementation and relevant OpenSpec intent before proposing
changes. Explain meaningful alternatives and why the selected approach fits.

Use acceptance scenarios to describe externally observable success and failure.
Cover compatibility, data handling, boundaries and dependencies relevant to the
change. Design tests that could expose a real defect rather than mirror code.

Choose coherent tasks and dependencies. Use a diagram when it clarifies the
approach; keep detail proportional to the decision. Link canonical sources
instead of duplicating them into task shards, overlays or dispatch schemas.

Identify unresolved decisions and risks with evidence. The coordinator combines
the design with the user's context and obtains only decisions still missing.
