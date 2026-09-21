# Optional knowledge integrations

TH workflows retain context through the [workspace skill](../skills/workspace/SKILL.md).
They work in local or Obsidian mode without Context Harness, Memory MCP or remote
flow telemetry. Setup and update do not require those services.

The [kg skill](../skills/kg/SKILL.md) remains available when the user explicitly
wants to use an already configured knowledge service. Configure it through the
active host's native MCP tools; capabilities and authentication belong to that
service. Existing personal endpoints, credentials and unrelated settings are
preserved. Context7 is a separate optional documentation source.

There is no automatic KG enrichment, session-start/session-end write or
cross-user flow-event export in the workflow. Explicit knowledge writes follow
the requested scope and native permissions. Keep secrets and temporary execution
evidence out of shared knowledge; see [knowledge content guidance](kg-content-policy.md).
