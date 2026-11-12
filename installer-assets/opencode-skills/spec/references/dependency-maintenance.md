# Selected TH dependencies

Use this maintenance pass during TH update, after selecting the validated TH
snapshot. It installs missing dependencies and updates existing dependencies only
for integrations already selected for this project or computer. Provider-only
requests keep their explicit target and do not trigger TH installation.

## Bind before changing

Read the active host/project's TH selections and retained provider bindings.
An explicit selection in the current request also qualifies. PATH presence, an
upstream catalog entry, or a dependency of an unrelated project does not.
If no selection can be established, report `not-selected`; do not guess or
install the entire catalog. Do not traverse other projects or other host homes.

For each selected dependency, record its official owner/package, selection
evidence, runtime, scope, absolute executable or skill path, owning manager,
installed version/ref and requested version policy. Treat Node, Python and host
applications as prerequisites, not implicitly TH-owned tools. A shared/global
installation is not TH-owned merely because TH invokes it. Preserve it unless
the request specifically authorizes that shared installation; otherwise use an
authorized isolated tool cache supported by the provider, or report the conflict.

## Maintain independently

Use the provider's existing official lifecycle from
[upstream tools](upstream-tools.md), never a new wrapper
or copied upstream implementation. Reuse native permissions for each operation.
Install an absent selected dependency in its established scope; for a new
tool-only installation use the authorized TH tool cache or project skill scope.
Never edit a consumer application's manifest/lockfile or switch managers/scopes
implicitly. The selected provider's own installer-managed lock/receipt may be
updated by its official lifecycle within the authorized scope.
Never run blanket `npm update -g`, all-skills, all-plugins or system upgrades.

Resolve the current compatible stable release from the official owner, record
its exact version, inspect runtime requirements, then invoke that exact version.
Honor explicit pins and compatibility bounds; do not silently turn a pinned
dependency into `latest` or install a prerequisite system runtime. Record missing
prerequisites as pending while continuing independent dependencies.

- OpenSpec, TEA, REA and quality tools retain their owner-specific routes and
  project scope. CLI maintenance does not authorize project initialization,
  generated-workflow migration or changing project dependencies.
- Cloudflare and Sentry use the targeted Skills CLI routes, verified by owner
  and skill name. Updating the CLI package and updating installed skills are
  different outcomes. Never use an unscoped all-skills update. Check shared-root
  effects before refreshing a provider; preserve unrelated host installations.
- [Impeccable](../../ui-design/references/impeccable.md) retains its official
  installer and recorded-provider update scope; do not assume a single-provider
  update flag or overwrite independently owned installations.
- [Modern Web Guidance](../../ui-design/references/modern-web-guidance.md)
  uses its official npm CLI with `DISABLE_TELEMETRY=1`
  for every invocation. A version-pinned `npx --yes modern-web-guidance@VERSION`
  route needs no global installation. Prepare/verify the selected version with
  `--help`; report this as cached/on-demand, not a globally installed executable.
  Do not install its optional skill or enable upstream automatic updates merely
  to maintain the CLI. Use synthetic queries only for smoke verification.

Verify the actual selected path and version after each operation, then a safe
provider-specific help/discovery probe. Distinguish installed, discoverable,
usable and live activation; successful package-manager output alone is not proof.
Do not execute an audit, publish output, log in, or send project data as a probe.

## Receipt and partial results

Keep one record per dependency with `owner`, `selectionEvidence`, `scope`,
`manager`, `path`, `before`, `target`, `after`, `status`, `verification`, and
`failure` (nullable). Missing versions stay null, never fabricated.
Statuses are `current`, `installed`, `updated`, `prepared-on-demand`,
`not-selected`, `blocked`, `failed`, or `uncertain`. Include a concrete next step
for non-success outcomes and keep this receipt separate from TH convergence.

A technical failure affects only dependent work. Continue other authorized,
independent dependencies and TH maintenance; summarize completed and pending
items together. Verify uncertain state before any retry. Never change route,
scope or batch size to evade a permission denial. Stop only work affected by a
general access problem or a denied action. Do not claim full success when a
selected dependency remains blocked, failed or uncertain. Preserve successful
updates; do not roll them back because another dependency failed.
