---
name: validate
description: Validate delivered behavior against the intended outcome and report concrete gaps.
---

Handle $ARGUMENTS in the current general agent.

Compare the current implementation with acceptance and run relevant repository
checks. Use independent QA, tester, security or adversarial review where useful.
Record findings, evidence and coverage limits; the coordinator decides the next
step. Reuse applicable checks and verify corrections without universal quotas.

Use Codex-native tools and available agents. Read TH preferences from
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json` only when relevant; absence
uses ordinary defaults. Native permissions and user settings remain in effect.
