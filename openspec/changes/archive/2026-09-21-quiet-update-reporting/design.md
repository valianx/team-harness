## Context

See proposal.md for the recurring update-summary problem. Each runtime has its
own update entry; Codex and OpenCode delegate activation assessment to reload.
The installer CLI also emits guidance before the agent writes its final response.

## Decisions

- Keep installation and activation evidence separate. Update consumes reload's
  detailed observations and reports concrete exceptions; explicit reload retains
  its diagnostic report. Removing activation checks would hide real failures.
- Change maintained runtime entries and the CLI output, then regenerate mirrors.
  Do not change receipts or infer activation from installation success.
- Exercise actual CLI handlers against isolated state, including repeated Codex
  updates. Review instruction scenarios directly rather than freezing prose in
  snapshot assertions.

## Risks and scope

Concise output could conceal an actionable failure: preserve failed-domain and
observed-component reporting. Unknown activation remains unverified in diagnostic
evidence. This change does not alter host lifecycle, permissions or installation
mechanics, and does not repair unrelated findings from the general audit.
