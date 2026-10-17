# Worker model profiles

For OpenCode and Pi operators choosing specialist models while keeping the chat model under native controls.

## Choose workloads

Every profile starts with inheritance. Select providers and models with the runtime's catalog and confirm the preview:

| Profile | Suggested work |
| --- | --- |
| `reasoning` | Planning, review and complex decisions |
| `general` | Implementation, research and documentation |
| `mechanical` | Bounded cleanup and delivery |

The preview shows role assignments. You may reuse one model for every profile or override individual roles. Categories do not promise model quality or cost. Listing a model does not establish authentication or successful execution; use native controls for credentials.

## OpenCode

Run the installed TH binary against the intended native root/scope:

```text
install setup models --runtime opencode --scope global
install setup models --runtime opencode --worker-models-file /absolute/profiles.json --dry-run
install setup models --runtime opencode --worker-models-file /absolute/profiles.json --yes
```

The guided action uses `opencode models --verbose` without `--refresh`. Use `--opencode-cli ABS` to select a native executable when PATH discovery or a platform shim cannot launch directly. A file run without `--yes` in a noninteractive terminal only previews; `--non-interactive` alone does not approve changes. Confirmation applies specialist metadata and preserves primary/orchestrator selection, native model/permission settings and unrelated preferences. Native OpenCode configuration can override generated agent metadata.

Existing opt-in provider tiers remain compatible when `worker-models` is absent. Explicit profiles, including `inherit`, take precedence for specialists. Migration requires a confirmed profile draft; it does not automatically rewrite legacy settings or the primary model.

## Pi

Run `/th-worker-models` in the loaded native session. Choose profiles or role overrides and confirm the preview. Cancellation saves nothing. Pi saves preferences in its selected agent directory and uses the native model registry and thinking capabilities.

Only new worker conversations use saved changes. Queued/open workers, follow-ups and restored sessions retain their original model/thinking and usage ownership. The chat's model/thinking is unchanged.

## Preference object

The runtime's `.team-harness.json` contains one `worker-models` object. An OpenCode input file contains that object directly:

```json
{
  "schema_version": 1,
  "profiles": {
    "reasoning": {"mode": "inherit"},
    "general": {"mode": "inherit"},
    "mechanical": {"mode": "inherit"}
  },
  "role_overrides": {
    "architect": {"profile": "reasoning"},
    "cleaner": {"mode": "inherit"}
  }
}
```

Replace a selection with `{"mode":"model","provider":"native-provider-id","model":"native-model-id"}` using exact catalog identities. All three profiles are required; role overrides are optional. Resolution is role override → assigned profile → inheritance. Primary/coordinator roles cannot receive worker overrides.

Invalid input leaves saved choices intact. If catalog verification is unavailable, restore the native CLI/registry and retry the preview. If a selected identity is missing, choose an available identity explicitly; TH preserves the preference and never substitutes another model silently. OpenCode checks saved choices before its form; supply a corrected `--worker-models-file` to replace a retired choice through a fresh preview.
