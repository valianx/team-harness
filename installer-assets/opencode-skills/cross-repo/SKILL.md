---
name: cross-repo
description: Analyze dependencies and coordinated changes across multiple operator-authorized repositories in opencode.
---

# Cross-repository analysis in opencode

Require an explicit list of repository paths or URLs and a concrete question.
Read only repositories the operator placed in scope. Analyze dependency,
interface, version, and rollout relationships independently, then consolidate
conflicts and the required ordering. Do not clone private repositories, change
branches, or write to external systems without a separate live approval.
