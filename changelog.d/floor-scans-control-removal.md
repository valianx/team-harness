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
