### Fixed

- The shared security-floor classifier evaluated content signals over added diff lines only, so a
  change that **removed** a security control at a path matching no path-level signal produced no
  signal and raised no floor. Removing an authorization check is the shape a security regression
  takes; a floor blind to it is blind to the case a security review exists to catch. The classifier
  now reads every line a change touches. The pipeline's own backstop already stated this rule and
  the shared classifier — which `docs/pipeline-lanes.md` calls the single sensitivity authority —
  did not, so the leak reached the guided lane and every inline review.
- Hunk-line collection is positional: `---`/`+++` count as file headers only between a
  `diff --git` line and that file's first `@@`. A removed `--`-style comment produces a diff line
  byte-identical to a real `--- a/path` header, and no single-line pattern separates them.

### Changed

- The retired bug-fix forcing rule is deleted from the three sites that still asserted it. The
  field's only writer states that `security_sensitive` is "applied uniformly regardless of `type`",
  and the rule shipped and was retired twice. Two clauses citing a risk-metadata table that does not
  exist now point at the sensitive-path list itself.
- The guided lane no longer claims a publication precondition no hook enforces. It states what it
  produces: the classification is derived from the diff and cannot be talked out of; the hold on
  publication is coordinator discipline, and says so.
- `agents/_shared/operational-rules.md § "Pipeline integrity"` described a retired sequence, and its
  git rule forbade force-pushing to any branch, which does not match the `dev-guard` floor. Both
  corrected. The fourteen agent pointers that restated the language clause now inherit it from the
  canonical instead.

### Fixed (review round)

- Deleting a whole file carrying a security control raised no floor. A deletion reads
  `+++ /dev/null`, so the new path is not a path and every removed line was discarded — the same
  fail-open in a different shape, and pre-existing rather than introduced here. The collector now
  attributes a deleted file's removed lines to the path the file had. Verified to fail against the
  previous collector before being accepted.
- The rewritten git rule allowed an owned-branch force-push without checking that
  `agents/_shared/gate-contract.md` is stricter: Invariant E, operator-mandated, forbids an
  activated pipeline from force-pushing at all and states that a `ship` decision cannot authorize
  one. The exception is now scoped to direct work and cites the invariant it does not relax.
- The pipeline sequence started at `design`, which reads as permitting a skip past the mandatory
  Discover disposition, operator advance, intake, and classification. It now names them first.
- `agents/documenter.md § "Language"` told the agent to write all documentation in the operator's
  language, which conflicts with the canonical English-only rule for committed content. Scoped to
  the vault pages the documenter actually writes.
