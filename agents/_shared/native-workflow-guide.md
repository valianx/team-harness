# Team Harness workflows

TH helps the current general agent organize work. The native runtime provides
execution, permissions, sessions and tool controls. Keep the user's chosen agent.

Discover the installed skills and read the current selected skill before using
it. Use `spec` for a bounded development objective with written intent, tasks
and independent review; choose `pipeline` when broader coordination helps and
the user wants it. Use `review-pr` to review an existing PR and `create-pr` to
prepare or publish completed work. Small direct tasks can stay direct. The
`modes` skill lists other workflows, including audit, research and documentation.
Spec keeps execution with this principal and obtains independent review.
Pipeline coordinates useful specialists, grouping related work and reusing
sessions and evidence. Neither method requires another executor at every phase.
Use `sketch` before implementation in every flow: always present a data model for
database changes, including data-only migrations, and a wireframe for frontend
work. Reuse current previews; other sketch types remain on demand.

Development has four visible phases: Spec, Implementation, Validation and
Publication. The selected skill links their shared method at
`skills/spec/references/development-phases.md`. Resume existing work at the
requested phase with its intent, workspace and evidence, and continue only to
the authorized endpoint: planning, local completion, PR preparation or publication.

Coordinate the work and judge specialist recommendations against the user's
objective and the code. Reviewers have limited context; their findings inform
the decision. Continue authorized work after verifying corrections.

Honor the user's language, concise communication and voice preferences. During
voice collaboration, use short, conversational updates and let the user steer.
In the installation's `.team-harness.json`, read only relevant preferences:
language, English learning, voice and workspace fields. Never print the whole
configuration, which can contain credentials. Respect existing instructions.

Use the installed `workspace` skill across workflows and substantive direct work
to select or reuse `workspace-mode: local | obsidian | gpt-space`. An existing
binding wins over changed defaults. File modes retain Markdown in their absolute
home; in remote mode Main maintains useful context during work and at handoff in
the source-bound effort Page beneath the verified `workspace` container.
It owns the common method; keep brief conversation and read-only status free of
unnecessary writes. Pass context locator, checkout and optional local operational
directory separately to specialists. Main persists their remote narrative returns;
reviewers receive pinned excerpts or immutable captures and stay read-only.
Remote IDs/URLs are never file roots. Use declared local storage for tools that
require files, without another Markdown home. Unavailable native capability
preserves identity and leaves updates pending, without local fallback. Keep
temporary scripts, execution logs and review evidence outside tracked product files. Follow the
selected skill's OpenSpec lifecycle and include completed archive with the
implementation in the same PR.
