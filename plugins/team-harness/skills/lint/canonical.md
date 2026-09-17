
Inspect the relevant TH sources or installation from $ARGUMENTS using the
active runtime's paths. Keep the check focused on the requested concern.

## Select the scope

For `--against "<name> | <description> | <keywords>"`, compare the proposal
with the available skill catalog. Read the closest skills to understand their
actual triggers, workflow and outputs. Explain which existing skill could be
extended, or what distinct need justifies the proposal. Similar names alone do
not establish duplication: related formats or providers can need separate
workflows. Return the nearest matches and a recommendation with reasons;
the comparison does not change files or block creation.

For `--changed`, inspect skills affected by staged, unstaged and untracked work
in the current repository. Include changed supporting resources and the skills
that use them, not just edited `SKILL.md` files. If there is no Git checkout,
report that the changed scope is unavailable and inspect the named target or
available catalog, stating the scope used. An empty diff means no changed
skills; it is not evidence that every installed skill was checked.

With no narrower target, inspect the available package and highlight related
skills whose responsibilities or triggers warrant a closer look. When flags
are combined, report the proposal comparison and changed-skill check separately;
`--against` still searches the whole available catalog.

## Inspect and recommend

Validate parseable manifests and role metadata, actual referenced resources,
generated asset freshness, and configuration supported by the installed host.
Use repository validators or native tooling where available. An unavailable
tool is a coverage limitation, not proof that the installation is broken.

Review skill and agent instructions for clear objectives, useful context and
coherent references. Follow a realistic request through the entrypoint and its
references: can the agent complete the advertised workflow, find its inputs,
choose the relevant specialist and produce the intended result? Check that
arguments and callers still refer to supported behavior. Keep writing concise;
fixed word ceilings, mandatory section counts and phrase lists are not
acceptance gates.

Report concrete defects and useful recommendations separately, with file paths
and evidence. Preserve user configuration and make repairs only within the
requested scope. Inspect native permission settings as context; TH does not
repair them into its own profile.
