# Implementation release assembly

This file owns the coordinator's deterministic release assembly at the end of
`implementation`, before Freeze opens `validation`. Delivery never repeats any
step from this file.

## Invariant

Implementation hands validation a complete, committed branch. Product code,
tests, documentation, version sites, and changelog are all part of the same
reviewed state. Freeze and validation therefore see the exact commit that a
later `ship` may publish.

The coordinator executes this assembly after task commits and evidence close,
but before build/lint, the frozen diff, or the verification packet. Specialists
do not bump versions or assemble changelog fragments.

## 1. Resolve and apply the version

Resolve version sites in this order:

1. the approved plan's multi-site invariant;
2. the repository's documented canonical version table; or
3. the first applicable ecosystem file (`.claude-plugin/plugin.json`,
   `package.json`, `pyproject.toml`, `Cargo.toml`, `build.gradle`, `pom.xml`,
   `mix.exs`, `version.txt`, `VERSION`).

Never edit a schema or manifest-format version. Classify the reviewed change
using SemVer: observable additions and compatible new public surface are MINOR;
fixes, compatible internal changes, performance work, and shipped dependency
updates are PATCH; incompatible removals or defaults are MAJOR. Repository-only
tests, CI, and internal documentation may remain unbumped only when repository
policy permits it. A documented `skip-version: true` policy skips this step.

For a multi-site invariant, update every site in one assembly and require exact
MATCH before continuing. An over-bump requires the existing
`bump-override: {level} — <reason>` coordinate for Gate 3.

## 2. Materialize changelog

For an operator-visible change, write the repository's canonical changelog
entry now. Follow repository policy: direct release section when required, or
an exact `changelog.d/{slug}.md` fragment when fragments are canonical. Internal
tests, CI, build tooling, governance, and repository-only documentation need no
entry unless local policy says otherwise.

When fragments are assembled immediately, validate slug containment, combine
standard Keep a Changelog subsections in lexical order, preserve bullet bytes,
and cut the versioned release without reformatting older releases. Version and
changelog are implementation artifacts, not Gate-3 preview artifacts.

## 3. Commit the complete candidate

Stage only the resolved version sites and exact changelog paths produced by
this assembly. Unrelated dirty or untracked paths block; never sweep a directory
or use a broad add. Commit with the repository's conventional format, normally:

```text
chore(release): bump <version> for {feature_name}
```

If the implementer already included the exact reviewed release metadata in its
task commit, do not create an empty assembly commit.

After assembly require:

```bash
git status --porcelain                  # empty
git rev-parse HEAD                      # freeze candidate commit
git rev-parse 'HEAD^{tree}'             # freeze candidate tree
```

Persist the full values as `freeze_commit_sha` and `freeze_tree_sha`. Build,
lint, suite evidence, the frozen diff, QA, and security all run against this
identity. Any later tracked or untracked change returns to implementation and
creates a new candidate; it is never repaired in delivery.

## 4. Compute review size and diff composition

After the candidate commit is clean and before Freeze, compute the review surface from the
immutable `verification_base_ref...HEAD` range. Count changed paths with `git diff --name-only`
and additions plus deletions from `git diff --numstat`; binary entries contribute to the file
count and composition but add zero textual lines.

The reviewer caps remain 400 changed lines and 8 changed files. When either cap is exceeded,
require a bounded justification in `02-implementation.md § Reviewability Exceptions`; absent
justification blocks Freeze. A justified large diff is flagged, not rejected automatically.

Classify every changed path unconditionally:

- **Mechanical:** only `CHANGELOG.md`, `changelog.d/*`, and the exact version sites resolved in
  § 1.
- **Substantive:** every other path, including README/CLAUDE/docs, contracts, source, and tests.

Classification is exact path membership, never extension, line shape, deletion count, or an
append-only heuristic. Persist
`delivery_diff_composition: {total_lines, total_files, mechanical_files, substantive_files}`,
`delivery_size_result: within-bounds|flagged`, and the optional justification pointer in
`00-state.md`. Freeze and the verification packet carry these values unchanged into Gate 3,
where they appear beside `audit_coverage`.

## 5. Freeze handoff

Freeze records the candidate commit/tree in `00-state.md` and
`00-verify-packet.md`. When acceptance passes without a tree change, copy the
same full values to `validated_commit_sha` and `validated_tree_sha`.

The selected verification base may be refreshed and reconciled only before
Freeze. Movement after validation is a PR merge-readiness concern, not a reason
to rebuild or mutate the validated branch during delivery.
