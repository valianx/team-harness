---
name: validate
description: Validate delivered behavior against the intended outcome and report concrete gaps.
---

Handle $ARGUMENTS in the current general agent.

Compare the current implementation with acceptance and run relevant repository
checks. Use independent QA, tester, security or adversarial review where useful.
Record findings, evidence and coverage limits; the coordinator decides the next
step. Reuse applicable checks and verify corrections without universal quotas.

When a workspace contains applicable sketches, read them as design evidence and
report mismatches. Their absence does not fail validation; note missing design
evidence only when the acceptance depends on it. If the repository declares a
quality manifest, the coordinator may select the deterministic quality runner
with explicit repository, workspace,
base, candidate and manifest inputs. This skill does not invoke either helper
automatically.

Use Codex-native tools and available agents. Read TH preferences from
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json` only when relevant; absence
uses ordinary defaults. Native permissions and user settings remain in effect.
