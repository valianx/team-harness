## Context

See proposal.md. Named roles and generic fallback are separate Codex settings.

## Decisions

Pin pipeline aliases through the existing profile policy, preserving their logical role and reasoning effort. Leaving aliases unset would allow chat-model inheritance. Retain native generic spawn support for other profiles.

Extend the existing managed-pair migration and backup mechanism; do not overwrite custom fallback pairs. Update the updater's pinned helper digest together with the helper.

## Risks / Trade-offs

A host may list Sol 6.1 in its catalog before its active dispatch tool supports it. Report the limitation without fallback. Installing files alone does not demonstrate activation.

## Migration Plan

Ship the generated roles and versioned package through normal setup/update. Use native activation reporting. Rollback uses the prior package and configuration backup.
