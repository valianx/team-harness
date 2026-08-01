# Codex runtime beta evidence

Date: 2026-07-31

## Isolated marketplace smoke

Executed against a fresh temporary `CODEX_HOME`; no user Codex configuration was
read or changed.

```text
CODEX_HOME=<temporary> codex plugin marketplace add . --json
CODEX_HOME=<temporary> codex plugin list
CODEX_HOME=<temporary> codex plugin add team-harness@team-harness
CODEX_HOME=<temporary> codex plugin list
```

Result: the local marketplace resolved to `.agents/plugins/marketplace.json`,
`team-harness@team-harness` changed from `not installed` to `installed, enabled`,
and Codex cached version `3.6.1`. The cached snapshot contained all nine skills:
`setup`, `update`, `init`, `pipeline`, `design`, `implement`, `validate`, `deliver`, and `recover`, plus the
declared hook manifest, launcher, and six hook bundles.

## Isolated installer lifecycle smoke

Built the installer with an isolated Go cache and ran `plan`, `apply`, a second
`plan`, `update`, and `uninstall` against a new temporary `--codex-dir`.

Result: first plan/apply created six agent TOMLs; the second plan and update
reported six skips and zero writes; uninstall removed the same six ledger-owned
files. The Codex-specific ownership ledger remained as the lifecycle audit log.

## Automated evidence

- deterministic generator and freshness suite: pass;
- marketplace and runtime structure suites: pass;
- official local plugin validator: pass;
- Codex hook suite: 26/26 pass, including native-config, deny-shim, and
  no-autoapproval cases;
- prepublish/version guard suite: 79/79 pass across five current version sites;
- installer unit and race suites: pass;
- all Go packages: pass.

Final independent security re-review: clean, with no blocking findings. The
marketplace suite includes an external descendant-symlink rejection fixture and
the pipeline preflight rejects same-name agents without exact generated identity
markers.

## Remaining live boundary

A newly started interactive, authenticated Codex thread was not launched by the
test harness. Composer completion for `@Team-Harness` was observed manually,
but a full `@Team-Harness init` intake followed by an explicitly approved
`@Team-Harness pipeline`/recovery conversation remains beta
field validation; the isolated official CLI smoke proves marketplace resolution,
plugin enablement, cached skills, and hook assets.
