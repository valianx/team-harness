## Purpose

Stop `/th:review-pr` from discarding finished review work when nothing reviewable changed. Invalidation keys on code identity; environment drift is reported, not acted on; the security lens fires on evidence instead of on uncertainty.

## ADDED Requirements

### Requirement: Lens invalidation keys on code identity only
Freshness comparison SHALL invalidate captured review work only when `head_oid`, the commit list, or the code hash moved. Mergeability (`mergeStateStatus`) and conversation drift SHALL be reported as informational fields, never folded into code-changed, and SHALL NOT restart Gather or any lens. Base movement (`base_oid`/`merge_base_oid`) remains a reported change that downgrades the verdict line.

The identity the flow binds artifacts, agent dispatches, and the operator's publish approval to SHALL be stable across the same drift: mergeability leaves the composed context hash and survives as a reported field, and the context schema version moves with that composition change. Leaving mergeability inside the bound hash would relocate the discarded work to the approval boundary instead of removing it.

#### Scenario: A CI check completes mid-review
- **WHEN** `mergeStateStatus` changes between capture rounds while the head SHA and code hash are unchanged
- **THEN** the review proceeds on the existing captures, the bound context hash is unchanged, and the preview carries an informational drift line

#### Scenario: A new commit is pushed mid-review
- **WHEN** the head SHA moves between capture rounds
- **THEN** the flow invalidates and restarts exactly as today

### Requirement: The pre-publish freshness restart is capped
The pre-publish freshness check SHALL restart the flow at most once (parity with the pre-dispatch cap). A second consecutive drift at pre-publish SHALL surface to the operator with the drift summary instead of looping.

#### Scenario: The PR keeps moving during publish
- **WHEN** a second pre-publish capture still shows code drift after one restart
- **THEN** the flow stops and presents the drift to the operator with the drafted review preserved

### Requirement: The security lens requires a concrete trigger
`security_required` SHALL be true only on a concrete trigger: a sensitive-token content hit, an executable-suffix change, or an existing explicit or tier trigger (explicit operator request and tier-4 classification are preserved). Configuration suffixes SHALL classify as non-executable by default, and an indeterminate classification SHALL NOT default to required.

The configuration suffixes are the closed set `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.properties`; `.env` files and their variants stay outside it. The sensitive-path and sensitive-filename checks keep running first and are unchanged, so dependency manifests such as `package.json` and `go.mod` remain sensitive by filename regardless of suffix. `security_required` SHALL be a pure function of the resolved reason value and the trigger list, and the resolved reason SHALL appear in the preview so a not-required outcome is visible to the operator rather than silent.

#### Scenario: A config-only PR with no sensitive tokens
- **WHEN** a PR changes only configuration files with no sensitive-token hits
- **THEN** the security lens is not dispatched and the flow runs with the reviewer (and consolidator when applicable)

#### Scenario: A config file contains a credential-shaped token
- **WHEN** the diff's content scan hits a sensitive-token pattern in any file
- **THEN** the security lens is required exactly as today

#### Scenario: The operator explicitly requests the security lens
- **WHEN** an explicit trigger or a tier-4 classification is present
- **THEN** the security lens is required regardless of suffix classification
