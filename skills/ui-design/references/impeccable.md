# Impeccable dependency

Use the official external workflow for the selected UI task. Its installed
instructions and matching references govern methods; TH does not copy its
playbooks, tool catalog or detector.

## Resolve and prepare the selected capability

At entry or resumption, resolve the active runtime, official installation owner,
scope, actual compiled skill root, installed version/revision and required
capabilities. Record **installed**, **discoverable** and **usable** separately:
file presence alone proves neither native discovery nor successful execution.
Reuse a healthy capability without redundant installation or automatic update.

Verify current official help and owner records before authorized preparation or
repair. Select only the needed provider (`codex`, `claude` or `opencode`) and
established `project` or `global` scope; omit optional hooks by default.
Verified Codex project example, run from the target project:

```sh
npx impeccable install --providers=codex --scope=project --no-hooks
```

Use the actual selected provider/scope. Inspect effects on skills, agents,
commands, engine downloads and existing configuration; preserve unrelated and
independently owned files. Do not prepare inactive providers or use `--force`
to bypass an invalid ownership record. [Official installation](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/README.md#installation)
and [installer operations](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/crates/skills/src/commands.rs) explain the owner route.

Maintenance example: `npx impeccable update --scope=project --no-hooks`.
Update has **no provider selector** and refreshes **all providers recorded in
that scope**. Inspect actual effects; run only when authorization covers them.
Otherwise retain usable capabilities and report the exact pending maintenance
scope. Updating TH does not update Impeccable.

The researched baseline at source `245ad82def45831dc56a21b683c7a1ff530b06cc`
is [package](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/package.json)/compiled skill `4.5.2`, engine `0.1.14`, with Node `>=22.18` for npm.
Record actual installed skill, package/source and engine identities separately.
Pinning npm does not pin the current signed skill bundle; see
[bundle resolution](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/crates/skills/src/bundle.rs).

## Invoke the installed instructions

Project skill roots are `.agents/skills/impeccable` (Codex),
`.claude/skills/impeccable` (Claude) and `.opencode/skills/impeccable` (OpenCode).
Resolve global/plugin roots through their actual owner and
[provider layouts](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/crates/skills/src/providers.rs).
Read the installed compiled `SKILL.md` and applicable matching playbook directly;
unresolved source templates are not installed instructions. Direct loading keeps
Main's flow; [OpenCode's slash bridge](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/.opencode/commands/impeccable.md) starts build/subtask and must not replace it.

Run `<installed-skill-root>/scripts/impeccable context` once per session with cwd
at the target app; add `--target <route-or-file>` when applicable. Use its Windows
launcher when required by the shell. Follow the
[compiled skill](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/.agents/skills/impeccable/SKILL.md)
and matching launcher; upstream autonomy or delegation advice grants no new
effects, permission or coordination authority.

## Preserve ownership and supported limits

Keep upstream product/design records, metadata, configuration, surface briefs
and artifacts at their supported owner-project locations. The selected TH
workspace holds dependency readiness, research/adaptation rationale and links to
decisions and verification evidence, not competing design authority. On resumption,
read current owner records and report stale or contradictory context before
dependent work; do not repair independently owned drift as a design side effect.

On launcher refusal/failure, disclose that context loading did not run before
continuing, read existing `PRODUCT.md`/`DESIGN.md` and follow the permitted
playbook. Missing tools allow only supported fallbacks. New-direction rolls
contact the upstream service; telemetry opt-out does not remove that functional
request or establish an offline equivalent.

An unavailable detector permits disclosed manual/browser critique, not a claim
that detection ran. Applicable upstream finish captures remain required; missing
rendering or finish evidence stays pending. Record what succeeded, what could not
run and concrete recovery; installation and launcher success alone prove no UI
result, live host discovery or visual-quality improvement.
