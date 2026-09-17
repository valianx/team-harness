# Testing

Run `bash tests/run-all.sh` for the maintained repository suites. CI uses
`TH_REQUIRE_RUNTIMES=1` so missing required tools are visible as failures.
The runner names the current executable suites; it is the maintained inventory.

## Evidence

Tests should expose defects in executable behavior or machine-readable
artifacts. Derive expected outcomes from intended behavior. Use fixture config
roots and temporary repositories instead of live user installations.

Relevant coverage includes installer preservation, native role generation,
package freshness, OpenSpec integration, immutable PR/inline review evidence,
quality helpers, bootstrap scripts, and Claude discovery/language/optional
observability.

The native runtime owns command permissions. Tests for retired TH guards,
control-plane authority, managed permission provisioning, phrase lists,
mandatory document artifacts and prose ceilings have been removed with those
features. Review instruction quality through independent reading.

## Interpreting results

Record which selected checks actually ran and the candidate they apply to.
A successful exit does not establish execution of skipped or deselected tests.
Report failures, omissions and unknown counts honestly. Optional unrelated skips
do not erase valid evidence.

Use focused regression tests for fixes and repeat broader checks when changed
behavior or unresolved findings justify it. Keep raw logs in temporary storage;
the PR should contain a concise validation summary.
