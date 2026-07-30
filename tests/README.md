# tests/

Verification suite for the parts of this repo that execute. It is deliberately **not** a general test suite: the repo is mostly declarative `.md` assets, and those are not tested here.

**Before adding anything, read [README.md § "What gets a test"](../README.md#what-gets-a-test).** It is the binding rule on what may be registered, and it rules out a large class that used to live in this directory. Per-suite scope: [`docs/testing.md`](../docs/testing.md).

## Why this exists

Three surfaces have inputs, outputs, and exit codes, so a failure names a real defect:

- **Hook and gate logic** — the TypeScript bodies in `hooks/ts/bodies/` (compiled to `dist/*.cjs`, run via `hooks/run-ts-hook.sh`) plus `hooks/sketch-guard.sh`. Feed a payload, assert the decision.
- **Machine-readable structure** — YAML frontmatter that must parse, JSON manifests that must have a given shape, allowlists that must stay disjoint.
- **The installer and bootstrap scripts** — Go code and shell entry points with real filesystem effects.

Agent and skill prose is not on that list, and that is deliberate. A corpus of ~46,000 lines asserting the presence and wording of prose was deleted because it inverted authority: a failing literal search made adding a sentence the cheapest fix, so the prose came to serve the check instead of the other way round. Prose contracts are enforced by review — see `docs/testing.md § "(iii)"`.

## How to run

```bash
# Everything that runs without paid API calls
bash tests/run-all.sh

# The slower end-to-end tests (own prerequisites, skip cleanly when absent)
bash tests/run-behavioral.sh

# Individually
bash tests/test_policy_block.sh
python3 tests/test_security_scan.py
uv run --with PyYAML python tests/test_agent_frontmatter.py
go test ./cmd/install/ -count=1
```

`run-all.sh` is pure bash + python3 (stdlib, plus PyYAML for the frontmatter suite) with optional node/go legs. `TH_REQUIRE_RUNTIMES=1` — set in CI — turns a missing-runtime SKIP into a FAIL, so a green CI run means verified rather than unchecked.

## When to run which

| Trigger | Run |
|---|---|
| Pre-commit, or after any change under `hooks/`, `cmd/install/`, or `bin/` | `bash tests/run-all.sh` |
| Before a release tag | both |
| After changing `bin/` entry points | `run-behavioral.sh` |
| Investigating a "the harness is broken" report | `run-all.sh` first |

Editing agent prose is **not** a trigger. No suite reads it.

## What the tests do NOT cover

- **Agent prompt behaviour.** Whether a model applies a contract it has been given requires running a real pipeline.
- **Agent and skill prose.** Nothing reads it — by design.
- **Hook integration with the host.** Each hook is tested in isolation over stdin/stdout. Whether the host actually invokes it on every Bash/Write/Edit depends on the host's own wiring. To verify that, restart the host and try a benign command (`rm -rf /tmp/foo` should pass) and a destructive one (`rm -rf /` should be denied with the policy reason).
- **The pipeline itself.** Phase transitions only fire inside a real run. Smoke-test by running a feature through and checking that both the events file and `00-pipeline-summary.md` appear under the workspace — both are mandatory for any non-Tier-0 run, and checking only the event log passes while a missing summary goes unnoticed.

## Adding a new test

- New `policy-block` pattern → an `assert_deny` / `assert_allow` line with a one-line name.
- New hook decision path → a payload case in that hook's suite.
- New installer behaviour → a Go test under `cmd/install/`.
- New agent file → nothing to do; `test_agent_frontmatter.py` picks it up automatically and fails immediately if the YAML does not parse.
- A new pipeline phase, agent contract field, or mandatory prose section → **no test.** Put the contract in the agent's own file, where it is read.

Existing cases are append-only by design; refactor one only when the assertion itself is wrong.
