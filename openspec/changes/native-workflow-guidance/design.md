## Context

TH adds workflows to the native general agent. OpenCode currently overwrites `default_agent` on install/update; simply removing that write would leave the native agent without TH discovery because the installer does not install the context hook. Codex init and pipeline activation also retain requirements already removed from their shared contracts.

## Goals / Non-Goals

**Goals:** retain native agent selection and execution authority, provide concise workflow discovery and collaboration preferences, and make the affected entry points agree with the shared contract.

**Non-Goals:** redesign the pipeline, remove optional agents, migrate ambiguous user preferences, install a context hook, change personal installations, or repair every audit finding.

## Decisions

- Install a small TH guide as an existing reference component and register its absolute path through OpenCode's native `instructions` array. Preserve unrelated entries and settings; repeated application is a no-op. Reject malformed configuration before any write.
- Track only the exact installed TH guide association, not ownership of the instructions array or the user's general-agent preference. A preexisting reference to that same managed file is retained once and removed with the file on uninstall. Keep legacy ledger entries readable. Uninstall clears a literal TH default only when removing its owned agent; custom/default native selections survive.
- Codex init verifies the selected installed reviewer definition and uses native read-only dispatch. Report limits on visibility into loaded definitions without demanding an unavailable session attestation.
- Codex pipeline activation uses the resolved workspace and the active runtime's permissions. Report an actual denial with its destination; never provision Claude policy from Codex. Preserve workspace identity, containment and ownership checks.

## Risks / Trade-offs

- A previously forced TH selection cannot be distinguished from a deliberate one. Preserve it during installation/update and document the native choice rather than guessing intent.
- Native instructions add a small amount of general-agent context. Keep the guide short and defer detailed behavior to the selected skill.
- Config registration and uninstall must preserve unrelated instructions and legacy ownership. Cover these transitions with behavioral installer tests, including malformed and linked files.

## Validation

Exercise fresh, custom-agent, legacy-agent, repeated update and uninstall scenarios. Run installer tests, workspace and reviewer contract tests, generated-package checks and OpenSpec validation. Review the committed candidate independently, recording recommendations and their disposition outside the repository. Archive the completed change in the same PR.
