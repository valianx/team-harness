---
name: lint
description: Inspect Team Harness installation and package health, separating executable defects from workflow recommendations.
---

Inspect the relevant TH sources or installation from $ARGUMENTS using the
active runtime's paths. Keep the check focused on the requested concern.

Validate parseable manifests and role metadata, actual referenced resources,
generated asset freshness, and configuration supported by the installed host.
Use repository validators or native tooling where available. An unavailable
tool is a coverage limitation, not proof that the installation is broken.

Review skill and agent instructions for clear objectives, useful context and
coherent references. Keep writing concise; fixed word ceilings, mandatory
section counts and phrase lists are not acceptance gates.

Report concrete defects and useful recommendations separately, with file paths
and evidence. Preserve user configuration and make repairs only within the
requested scope. Inspect native permission settings as context; TH does not
repair them into its own profile.
