### Added
- Data-home resolver (`ResolveDataHome`, `OpenStateFile`) in `cmd/install/` — opencode Phase 2 / Item 3: 5-branch resolution order, SEC-01/02/03/08 guards (pre-resolution Lstat walk, O_NOFOLLOW handles, fchmod/DACL on handle, single-pass `os.ExpandEnv`), Windows DACL with process-token SID, language-neutral conformance fixture for cross-language drift prevention.
