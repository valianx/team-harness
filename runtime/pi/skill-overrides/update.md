# Update Team Harness in Pi

Maintain the selected Pi-owned TH package. Bind its existing source, scope,
absolute package root and active Pi agent directory from native discovery;
preserve unrelated packages, settings, authentication, model and thinking.
An explicit version/ref remains fixed for this operation.

Use `pi list` when the installation identity is not already known. For the
installed source, use Pi's targeted `pi update <installed-source>` command.
Do not run a bare `pi update` to update TH: that updates Pi itself. Avoid
all-package update flags for a TH-only request. A pinned Git tag/commit remains
pinned; reconciliation does not select a newer ref. Changing the selected ref
uses Pi's supported package-source maintenance at the same selected scope.
Keep the old source identity available for recovery until the replacement is
verified; do not register duplicate TH sources or remove unrelated entries.

Local packages are live directories. Their source owner prepares an authorized
revision in that checkout; a Pi update acknowledgement does not prove that a
local checkout advanced. Do not substitute a Go/Claude/Codex/OpenCode installer,
run another host's updater or silently migrate installation ownership.

From the validated resulting package root, under the selected Pi environment,
run:

```text
node <package-root>/runtime/pi/settings.mjs ensure --version <package-version>
```

Verify the returned settings path is `<native-agent-dir>/.team-harness.json`.
Maintenance preserves existing selectors, conflicts, destination IDs and
opaque values. Existing invalid preferences receive diagnostics; update does
not repair them or perform remote Page operations. A failed update or settings
publication remains incomplete and must not be reported as activated.

When the operator selected an upstream provider update, use only its owner and
Pi route from [upstream tools](../spec/references/upstream-tools.md), preserving
its selected root/scope. Updating TH does not reinstall OpenSpec, TEA/BMAD,
Superpowers or unrelated providers. Check installed, discoverable and usable
states independently.

After the selected package is current, follow [Pi reload](../reload/SKILL.md).
Keep installation and live activation results separate. Report the actual
version/source, settings reconciliation and any pending native operation;
do not infer activation from new files or prescribe a generic restart.
