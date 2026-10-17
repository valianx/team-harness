# Pi runtime

For Pi operators installing Team Harness workflows and coordinating native specialists.

## Install and maintain

Use Pi 1.3.0 with Node 22.19 or newer. Install the Git package with
`pi install git:github.com/valianx/team-harness`, or a checked-out directory with
`pi install /absolute/path/to/team-harness`. Add `--local` for a project declaration;
Pi requires project trust before loading it. A Git tag or commit can pin the source.

Pi owns the package declaration and resource discovery. Use `/reload` to activate
changed resources, `pi update <source>` to reconcile that package, and
`pi remove <source>` to unregister it. Pinned references remain pinned.
Run `/skill:th-setup` for TH preferences. Workflow names have the `th-` prefix,
for example `/skill:th-spec` and `/skill:th-review-pr`.

## Select the workspace

TH preferences live at `${PI_CODING_AGENT_DIR:-~/.pi/agent}/.team-harness.json`.
Pi and TH helpers use the same selected directory. Existing settings and unrelated
values are preserved by maintenance; reads do not rewrite the file.

`workspace-mode` accepts `local`, `obsidian` or `gpt-space`. Retained effort
bindings take precedence over later global changes. A Space effort remains beneath
its verified `workspace` container. Pi needs its own native Space capability:
another host's connection does not supply it. Missing access preserves the locator
and reports the unavailable operation; it does not create a local replacement.

## Coordinate specialists

The current Pi session coordinates through `th_worker_dispatch` and
`th_worker_control`. Dispatch selects an eligible canonical role and a task;
control supports status, follow-up, bounded wait, collect and cancel. Reference
documents and the orchestrator are excluded from the worker catalog.

Workers inherit the current native model and thinking selection. Canonical model
aliases remain metadata. An unavailable provider resource is reported rather than
changing the model or enabling unrelated extensions. Only explicitly selected
resources load in workers; read-only roles exclude shell and mutation tools.

For a custom provider, set trusted absolute extension files in
`pi-workers.provider_resources` in the same TH settings document. An explicit
compiled launcher uses `pi-workers.launcher`:

```json
{"kind": "binary", "executable": "/absolute/path/to/pi"}
```

The default Node launcher resolves the installed public SDK entrypoint. Launcher
paths and provider resources are operator settings, not dispatch arguments.

Native Pi sessions retain conversation history. Reload verifies ownership, role,
directory and session identity before reuse. Uncertain execution remains interrupted
without automatic replay. Cancellation clears queues before abort and bounds cleanup
to TH-owned processes. Tool selection and working directories are not an OS sandbox;
hard crashes can leave detached native tool processes.

Collect attributes available native usage through final tool results and persisted
receipts. Repeated collection reuses the result without charging the same range again.
Missing, partial and uncollected accounting remain explicit. Reasoning/cache subsets
are not added to their parent totals; reported costs are estimates, not billing.

## Provider methods and verification

Selected OpenSpec, TEA/BMAD and Superpowers methods keep their upstream ownership.
Setup checks their actual Pi discovery in the selected directory. A default-root
installation alone does not prove activation under `PI_CODING_AGENT_DIR`.

Maintained hermetic tests cover the transport and lifecycle. Native verification
uses isolated Pi directories and handled fixture commands without external model
requests. It proves package discovery and public API compatibility, not model quality
or availability of a personal Space connection. See [testing](./testing.md).
