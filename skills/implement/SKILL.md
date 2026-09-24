---
name: implement
description: Implement approved work and continue directly into applicable validation.
---

# Implement

Continue the Implementation phase of [the shared development flow](../spec/references/development-phases.md).
Recover the existing intent, testing strategy, workspace and any explicit
operator stop or publication direction.
Execute selected TEA implementation methods using [upstream tools](../spec/references/upstream-tools.md).
Produce product changes, maintained tests and focused-check evidence, then continue
directly to [validate](../validate/SKILL.md) without waiting for another operator message.
Applicable validation is part of completing implementation unless the operator
explicitly asks to stop before it. Record assessments as pending until executed.
After applicable validation, use [create-pr](../create-pr/SKILL.md) to prepare
every completed repository-file change, including docs, tests, configuration and
other non-code work, whether implementation was direct, spec-based or pipelined.
Publication follows native permissions and honors an explicit operator stop or
decline; preparation remains required when publication is pending.

Use [workspace](../workspace/SKILL.md) to reuse the effort's absolute home in
its configured local or Obsidian mode. Main coordinates with native tools and
permissions. Reuse authorization for unchanged work and ask only for a missing
decision. Specialists provide evidence and recommendations; Main judges them.

Read the existing objective and relevant OpenSpec tasks. Before database or
frontend implementation, use [sketch](../sketch/SKILL.md) to create/update and
present the applicable model or wireframe, including data-only migrations and
direct/resumed work. Reuse an already presented preview if it covers this change.
Carry its decisions into the existing design; reuse authorization and resolve
only material open questions before dependent work. Main may implement or
delegate independent bounded tasks with explicit ownership. Preserve other
writers' edits, serialize overlapping changes and Git mutations, and run
appropriate checks. Report changes, results and material limits to the shared
workspace. This entry does not automatically activate a pipeline.
