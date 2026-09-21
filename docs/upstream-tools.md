# External tools

TH integrates OpenSpec, Superpowers and BMAD TEA into the existing workflow.
Their methods and updates remain upstream-owned.

Every tool, agent and workflow contributes evidence and recommendations. The
coordinator and operator decide which findings warrant action and how to proceed.
A provider verdict does not invalidate completed work, mandate corrections or
create an automatic delivery block. Reports retain the original result, the
coordinator's disposition and any unverified scope.

The shared [external-tool reference](../skills/spec/references/upstream-tools.md)
documents when each capability runs, native invocation, shared workspace outputs,
installation/update ownership and compatibility limits. It ships with the spec
skill so Claude Code, Codex and OpenCode read the same integration guidance.

Quality capabilities are selected per objective and stack, not installed universally:

- Semgrep CE supplies local rule-based candidates for `find-bugs` and applicable PR evidence.
- dependency-cruiser and Knip supply JS/TS audit evidence when entry points and resolution
  configuration are available; they are not ordinary `review-pr` dependencies.
- Sentry's upstream `find-bugs` skill is an optional captured-change method for the existing
  general reviewer. Its source/ref is resolved by owner, not by the basename alone, because TH
  also has a project/module diagnostic skill. TH uses `/th:find-bugs` in Claude Code,
  `$team-harness:find-bugs` in Codex and `th-find-bugs` in OpenCode; Sentry keeps
  `find-bugs`. Setup/update resolves the owner before changing an installation.
- arc42 and ATAM are maintained references for architecture questions, not installable tools.

The policy's `quality_providers` declarations record observed compatibility baselines and official
routes. Setup/update may prepare an explicitly selected provider through its owner; a healthy
installation is reused, inactive hosts are left alone, and installed/discoverable/usable states
remain distinct. Provider assets stay outside TH packaging and workflow recommendations remain
advisory evidence under native host permissions.

For canonical artifacts, verification and archive, see
[OpenSpec integration](openspec-integration.md).
