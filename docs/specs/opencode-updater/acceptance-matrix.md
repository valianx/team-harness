# Acceptance Matrix: opencode-updater

**Status:** DELIVERED | **Date:** 2026-06-29

| AC | Description (1 line) | Test (file:line) | QA evidence (file:line) | Security |
|----|----------------------|------------------|-------------------------|----------|
| AC-1 | update-available: version delta + plan preview + apply | `update_test.go:TestCompareSemver_ThreeStateDispatch` + `TestApplyUpdateDiff_NonInteractive_BumpsConfigAndNoAssets` PASS | `update.go:112-122` PASS | clean |
| AC-2 | already-current: zero writes to assets, ledger, config | `update_test.go:TestAlreadyCurrent_ZeroWrites_Decision` PASS | `update.go:85-100` PASS | clean |
| AC-3 | installed-ahead: report, no downgrade, exit 0 | `update_test.go:TestInstalledAhead_VersionReadAndNoDowngradeGuarantee` PASS | `update.go:103-110` PASS | clean |
| AC-4 | restart-to-activate message printed; never claims live | `update_test.go:TestApplyUpdateDiff_NonInteractive_BumpsConfigAndNoAssets` PASS | `update.go:174-177` PASS | clean |
| AC-5 | operator keys preserved byte-for-byte; backup written | `update_test.go:TestRefreshManagedConfigKeys_PreservesOperatorKeys` + `TestRefreshManagedConfigKeys_DoesNotForceLogs` PASS | `opencode_config.go:157-208` PASS | clean |
| AC-6 | no setup form re-run; opencode.json untouched | static: no `registerOpencodeMCP` call in update path | `update.go:55-124` PASS | clean |
| AC-7 | asset writes via reused engine; idempotent (second run = zero writes) | `update_test.go:TestAlreadyCurrent_ZeroWrites_Decision` PASS | `update.go:127-133` + `update.go:162` PASS | clean |
| AC-8 | missing/corrupt ledger: surface errors, no heuristic deletion | engine tests (existing `apply`/`uninstall` suites) PASS | `update.go:141-147` PASS | clean |
| AC-9 | bootstrap VERSION pre-check short-circuits when already current | `update_test.go:TestUpdateOpencodesSH_StaticVerify` PASS | `update-opencode.sh:83-89` + `update-opencode.ps1:74-80` PASS | clean |
| AC-10 | SHA256 anchored verify + neutral temp name (UAC) + dispatch | `update_test.go:TestUpdateOpencodePS1_StaticVerify` + `TestUpdateOpencodePS1_NeutralTempFilename` + `TestUpdateOpencodesSH_StaticVerify` PASS | `update-opencode.sh:158-171` + `update-opencode.ps1:155-181` PASS | clean |
| AC-11 | release.yml VERSION asset + pages.yml staging + smoke probes | static: `release.yml:54-60` + `pages.yml:36-37` + `pages.yml:129-159` PASS | file review PASS | clean |
| AC-12 | decline-confirm (n) = zero writes | boundary: `/dev/tty` interaction; structurally enforced by early return before write calls | `update.go:154-159` + `update.go:185-203` PASS | clean |
