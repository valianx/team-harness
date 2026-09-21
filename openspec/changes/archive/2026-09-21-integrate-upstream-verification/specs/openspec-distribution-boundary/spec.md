## MODIFIED Requirements

### Requirement: Distribution boundaries are verified across runtimes
TH SHALL have automated checks that enumerate shipped artifacts for every supported packaging path and fail when an undeclared project-local runtime file crosses the ownership boundary. Fixtures SHALL cover the native command and skill layouts produced by supported OpenSpec versions, including flat OpenCode commands.

#### Scenario: Packaging tests inspect a clean fixture
- **WHEN** the fixture contains OpenSpec-generated adapters for Claude, Codex, and OpenCode
- **THEN** the tests prove that TH installation outputs contain only TH-owned skills and commands while the fixture's OpenSpec files remain untouched

#### Scenario: A packaging path accidentally sweeps the repository root
- **WHEN** a distribution change would include an OpenSpec-generated adapter outside the declared TH roots
- **THEN** the packaging test fails before release and identifies the unexpected artifact

#### Scenario: OpenCode uses flat command files
- **WHEN** the fixture includes upstream-generated `.opencode/commands/opsx-*.md` files as well as any supported nested layout
- **THEN** TH packaging excludes both layouts without deleting or rewriting the repository's upstream integrations
