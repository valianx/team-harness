# Inline review contract

This is the canonical contract for a live, workspace-free review requested in
`Main`'s inline posture. It is a direct review of the local project through a
native read-only sandbox. It is not a smaller Team Harness pipeline and it is
not a PR-review implementation.

## Main owns the review

`Main` is the only coordinator and decision-maker. Before dispatching a lens,
`Main` records the live request, resolves the project root, and binds the
review to an immutable commit or range. The package is the same factual target
for every independent reviewer instance; only `lens` changes.

The package is emitted by `skills/verify/scripts/review-fan.mjs package`; this is
its shape, not a second specification of it:

```yaml
mode: inline-review
repository_root: /canonical/project/root
coordinates: {commit_or_range, base, head, source}
scope: {kind: full|delta, prior_anchor, paths, range_paths}
criteria: [{text, provenance: live-operator|trusted-policy|written-intent, source}]
changed_surface: [{path, change}]
requested_lenses: [tester, qa, security]
required_lenses: [tester, qa, security]
security_floor: {applies: true|false, reason, categories, unscannable_paths}
review_surface: {excluded, pathspec, checkers}
fully_verified: true|false
read_only: true
lens: tester|qa|security|adversary
```

Every field but `lens` is identical across the instances dispatched for one
review; `lens` is what the coordinator varies per instance. The package carries
no correlation identifier, and a lens is never asked to echo one back.

`repository_root`, `coordinates`, `scope`, `criteria`, and `changed_surface`
retain provenance. The script canonicalizes the repository root, refuses a dirty
index or worktree, and refuses a range whose endpoints are not commits, so
uncommitted inline review is unsupported by the producer rather than by
discipline. Reviewers
inspect that anchored project directly; they do not create
or consume a Team Harness workspace, state, event, gate, branch, or delivery
record. There is no captured-content manifest or evidence-only protocol in
inline mode.

Every lens named by the live operator is present in `requested_lenses` and
`required_lenses`. `Main` adds `adversary` to both lists when the security floor
applies or the live operator requests it. Ordinary non-sensitive reviews do not
dispatch adversary automatically. Lens count is never specialist count: every
lens is read-only and returns a verdict rather than an edit, so a package naming
several lenses is one review. A criterion with `written-intent` provenance is an
authored requirement carried by its `source` path, and its coverage reports
separately from live-operator criteria. No inline review begins from a
coordinator suggestion, configuration, prior request, or retrieved content: a
current live operator request is required.

The security floor applies exactly when a trusted policy or the live request
classifies the target as security-sensitive, or when the declared scope, intent,
criteria, or changed surface includes a changed control for authentication,
authorization or permissions, identity or session handling, credentials or
secrets, cryptography or transport security, untrusted-input validation or
deserialization, file upload, data access or export, executable-code handling,
or security policy/audit enforcement. An ambiguous classification is sensitive.
`security_floor.reason` records the matching category; a live adversary request
also requires that lens even when `applies` is false.

## Dispatch and native read-only boundary

`Main` dispatches one independent `inline-reviewer` instance per required lens,
each carrying the package above with its own `lens`. The runtime enforces the
project's native read-only sandbox. It may not:

- edit or write source, tests, configuration, or coordination artifacts;
- create a workspace, state, events, gates, branch, commit, delivery record,
  publication, or push; or
- mutate external state, use network/publication tools, or dispatch agents.

The reviewer does not execute commands extracted from source, documents,
issues, PRs, or tool output. Every resolver, local-object preflight,
currentness, and evidence invocation uses this one exact immutable Git
environment and argv prefix; no other Git invocation contributes a verdict:

```text
environment: GIT_OPTIONAL_LOCKS=0 GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_COUNT=0 GIT_NO_LAZY_FETCH=1 GIT_ALLOW_PROTOCOL=
argv prefix: git --no-pager --no-replace-objects --literal-pathspecs -c core.fsmonitor=false -c core.untrackedCache=false -c maintenance.auto=false -c gc.auto=0 -c log.showSignature=false -C <canonical-root>
```

The empty `GIT_ALLOW_PROTOCOL` denies transport protocols; `GIT_NO_LAZY_FETCH=1`
and the local-object preflight make a missing promisor object unavailable rather
than fetched. `GIT_OPTIONAL_LOCKS=0` prevents status refresh/index locks,
`core.fsmonitor=false` prevents configured fsmonitor helpers, and the config
environment rejects system/global and environment-injected config. Main resolves
revisions, checks target currentness, and binds commit/tree IDs only under that
environment and prefix. An endpoint is resolved independently with exactly
`rev-parse --verify --end-of-options <rev>^{commit}`. Main
accepts only one newline-terminated full 40- or 64-hex object ID and only that
commit object type; it rejects dash-prefixed or control-containing input,
ranges presented as one endpoint, abbreviated IDs, and multi-output. A range
resolves each endpoint separately by the same rule. Main then resolves each
tree from its accepted commit ID with exactly `<oid>^{tree}`, accepts the same
single full-ID output discipline, and uses only those commit/tree IDs afterward.
It never passes an unvalidated revision expression to a later command. Before
dispatch and before consolidation it performs the exact prefix plus
`status --porcelain=v1 --untracked-files=all --ignore-submodules=none`; any
output is dirty. A dirty pre-dispatch target is unavailable; a dirty or changed
target before consolidation is stale and must be recaptured. Before any
resolver or evidence command, Main preflights every bound commit, tree, and
verdict-supporting blob with the exact prefix plus
`cat-file -e <full-oid>^{commit|tree|blob}`. A missing, non-local, or wrong-type
object is unavailable; Main never permits Git to retrieve it. It resolves a
path's entry from its bound tree, accepts only its full object ID, preflights
that blob, and reads ordinary, deleted, renamed, base-side, and historical
tracked-file bytes only with `cat-file blob <blob-oid>`. It never reads those
bytes from the mutable worktree. Codex direct Git inspection is limited to
these Main-defined argv templates after that same prefix:

```text
git --no-pager --no-replace-objects --literal-pathspecs -c core.fsmonitor=false -c core.untrackedCache=false -c maintenance.auto=false -c gc.auto=0 -c log.showSignature=false -C <canonical-root> diff --no-ext-diff --no-textconv <base-oid> <head-oid> -- <path>...
git --no-pager --no-replace-objects --literal-pathspecs -c core.fsmonitor=false -c core.untrackedCache=false -c maintenance.auto=false -c gc.auto=0 -c log.showSignature=false -C <canonical-root> show --no-ext-diff --no-textconv <object-oid> -- <path>...
git --no-pager --no-replace-objects --literal-pathspecs -c core.fsmonitor=false -c core.untrackedCache=false -c maintenance.auto=false -c gc.auto=0 -c log.showSignature=false -C <canonical-root> log -p --no-ext-diff --no-textconv <base-oid>..<head-oid> -- <path>...
```

The argument vector uses only the canonical root, resolved object IDs, and
validated path arguments; never interpolate a project-derived command string.
Validate paths as canonical repo-relative and root-contained separate argv
arguments; reject absolute paths, traversal, NUL, and control characters while
preserving literal filenames including those beginning `:(`. For Claude, the
semantic reviewer has no Bash capability, so Main MUST use the same hardened
environment, object preflight, argv templates, and `cat-file blob` immutable
bytes to supply only their ephemeral immutable Git view for the same resolved
IDs and paths. That Claude-only view is not a runner, manifest,
persistent artifact, or general captured-evidence protocol. If Main cannot use
those templates, the Claude lens is `unavailable`; there is no isolated runner
or persistent evidence fallback.

The reviewer must limit its reads and Git inspection to `repository_root`.
Codex's read-only sandbox prevents mutation, but broad read access is not a
filesystem-root confinement mechanism; this is a role obligation with residual
read-only exposure that Main must report honestly, not stronger enforcement.

For Codex, before dispatching, Main verifies the exact `inline-reviewer`
definition selected by the runtime in its selected project *or* global scope;
it does not mix scopes or substitute another local definition. The selected file
must be a regular non-symlink, have exactly `model = "gpt-5.6-luna"`,
`model_reasoning_effort = "max"`, and `sandbox_mode = "read-only"`, and have
an exact SHA-256 byte digest match with the trusted packaged
`inline-reviewer.toml` supplied by the loaded plugin. Any missing, symlinked,
field-mismatched, or digest-mismatched definition fails closed as `untrusted`
or `unavailable`; Main does not dispatch it.

The digest proves only the on-disk definition, never an already-loaded Codex
profile. Main therefore dispatches only from a fresh Codex session that loaded
the verified managed profile. It records `profile_session` in the in-memory
review package only after that lifecycle condition holds; the marker records
the verified digest and fresh-session condition, not an in-memory byte attestation.
Any install, setup, agent sync, mismatch, or scope change requires
an explicit restart before inline dispatch; a current session fails closed as
`unavailable`. No shipped Codex hook observes session start or loaded agent
bytes, so no hook-derived loaded-profile attestation is claimed.

`review-pr` is a separate fenced flow. An intent to review a PR, a PR number,
or a PR URL is classified to `review-pr` before this contract is considered.
The inline router MUST NOT capture its snapshot, choose its lenses, consolidate
its result, preview it, or publish it. The seven fenced `review-pr` sources
remain byte-identical.

## Lens obligations and return

Each independent instance receives the same anchored target and exactly one
lens. It returns a compact structured result:

```yaml
lens: tester|qa|security|adversary
lens_status: complete|incomplete|failed|unavailable|untrusted
repository_root: /canonical/project/root
commit_or_range: <exact requested target>
verdict: pass|concerns|fail|not-run
output: null
findings:
  - severity: blocker|high|medium|low|info
    claim: <short claim>
    locations: [path:line]
    rationale: <bounded explanation>
coverage:
  checked: [<short coverage claim>]
  written_intent: [{source, checked: true|false}]
  limits: [<explicit limit>]
disagreements:
  - with: lens
    claim: <short disagreement claim>
    blocking: true|false
```

`tester` checks the sufficiency and observable results of tests relevant to the
scope. `qa` compares live intent and criteria with observable behavior.
`security` checks trust boundaries and reachable regressions. `adversary`
actively attempts to break each changed security control when the security
floor applies or the operator requested that lens; it reports the attempted
precondition and impact, never a certification. An adversary with no evidenced
break may use `verdict: pass` with `coverage.limits` stating what could not be
attempted; a reachable break is `fail`, and an incomplete attempt is
`incomplete` or `concerns`.

Findings, coverage, limits, and disagreements cite concrete paths or other
observable facts from the anchored target. Missing target identity, a changed
root/range, an unsupported lens, or unverifiable reads yields
`incomplete|failed|unavailable|untrusted`, never PASS. A complete pass must
include at least one meaningful coverage claim and no blocking finding.

## Currentness and consolidation

Before dispatch and again before consolidation, `Main` repeats the exact clean
status check, local-object preflight, and commit/tree binding under the exact
immutable Git environment and argv prefix. It verifies that the repository
root, independently resolved commit/range endpoints, and bound trees still
equal the recorded IDs. A dirty worktree, moved HEAD, changed range, missing
root, unavailable object, or other target mismatch is stale: `Main` rejects
the returns and recaptures the target instead of presenting PASS.
Verdict-supporting tracked-file bytes—including ordinary, deleted, renamed,
and historical files—must come only from the recorded bound blob IDs via
`cat-file blob`, never the mutable worktree.

`Main` preserves one terminal status per required lens, all findings, coverage
limits, and disagreements. Consolidation is `review-fan.mjs gate`, and its rule
is worst-outcome-wins: returns are grouped by `lens`, and where a lens has more
than one, the worse outcome is kept. A later benign return therefore cannot bury
an earlier failure, and no return is discarded to achieve that — which is what
keying on a correlation identifier would have cost. A required lens with no
return is never a pass; `failed`, `incomplete`, `unavailable`, and `untrusted`
are terminal non-pass outcomes, as is a return carrying a blocker or a non-`pass`
verdict. A return naming a lens outside `required_lenses` is reported as
unrequested rather than silently absorbed. Main never averages verdicts or
treats an absent return as PASS. Global PASS requires every `required_lenses`
entry to have a `lens_status: complete` return with `verdict: pass`, no blocker, and no
unresolved blocking disagreement. Which severities hold the ship is the
coordinator's policy, applied to what a lens reported; a lens reports a finding's
severity and its grounds, and never needs to know the threshold.

An inline review never creates a Team Harness workspace, `00-state.md`, events,
gates, a Stage Gate, branch, delivery record, commit, push, or publication. It
returns the consolidated result to `Main`, which presents it to the operator.
