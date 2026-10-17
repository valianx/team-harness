## Context

See proposal.md for motivation. Native package managers own Claude/Codex/Pi installations; the OpenCode binary owns its asset placement and root-isolated ledger. Existing Codex helpers need Python 3.11, but Python is optional for basic OpenCode/Pi installation. The existing Space configuration on this PC is complete and outside this change.

## Goals / Non-Goals

Provide one additive read-only report and short host-specific setup routes. Do not introduce a second installation ledger, universal runtime prerequisite, native policy manager or automatic cross-host repair.

## Decisions

1. **Shared optional Python reader.** Add a stdlib helper under `skills/setup/scripts/` and project it through the existing shared setup asset sync. An optional reader can inspect JSON/files and bounded native version commands on all supported platforms without another dependency. A Node-only reader would make Node a diagnostic prerequisite for Codex; a Go command would require another installation for three native hosts. When Python is absent, the active agent performs the native inventory and states that helper inspection is unavailable.
2. **Explicit roots and evidence.** The report uses schema version 1 and separate `cli`, `installation`, `configuration`, `activation` and `capabilities` fields per runtime. Accept explicit runtime/configuration/package roots and optional `--all`; respect supported native environment roots. Never use the selected host's root for another host. Inspect native registries/selected manifests conservatively; a configuration hint is not installed-package proof. Return unknown when authoritative discovery cannot be performed. Live activation remains unknown in the standalone helper.
3. **No diagnostic side effects or secret output.** Use fixed argv, timeouts and byte limits; do not expose subprocess output/errors or configuration objects. The report contains documented codes and bounded identities/versions/paths only. Missing evidence in one runtime does not prevent the other inventory entries. Existing symlinks may be read, never repaired.
4. **One requirements catalog.** Keep machine-readable minimum and optional requirements with the helper and expose them in its output. Setup instructions use that catalog and native evidence, offer minimal/reuse/optional choices, and verify Python candidates (`python3`, `python`; Windows `py -3`, `python`, `python3`) for the chosen helper. Codex's agent helper requires 3.11; basic native OpenCode/Pi packages do not require Python or Go.
5. **Bounded proof and delivery.** Hermetic temporary-root fixtures cover the observable report and nonmutation, not wording in skills. Reuse native package-owner checks and existing generated-asset tests. TEA test-design precedes implementation; test-review, trace and actual OpenSpec implementation verification use the same current evidence. No live model call is needed. Only this change and affected contracts are reviewed.

Documentation budget: extended — four setup entry points must explain the same optional diagnostic with different native package ownership, and the installation reference must state minimum requirements; maximum 100 added nonblank lines across canonical/override setup prose, docs/install.md and one testing-registry row. Generated copies do not consume a second editorial budget.

## Risks / Trade-offs

- Native registry formats may differ → validate identity and report unknown rather than guessing or reading private credentials.
- A CLI's version command can fail → bound execution/output and retain the independent file/configuration evidence.
- No Python interpreter → preserve basic installation; disclose unavailable helper inspection and give native recovery.
- A package manifest proves selected files, not a running session → activation remains separately unknown.

## Migration Plan

Add the helper and setup guidance, regenerate distributed resources, and keep existing installation owners/preferences intact. No migration or automatic configuration write occurs. Removal of the additive helper restores the previous setup route.
