# Acceptance Matrix: fix-473-update-opencode

| AC | Description (1 line) | Test (file:line) | QA evidence (file:line) | Security |
|----|----------------------|-------------------|--------------------------|----------|
| AC-1 | `git ls-files -s` shows mode `100755` for all three bootstrap scripts | `tests/test_bin_tty_execbit.py:91-131` PASS | `02-implementation.md` + `03-testing.md` PASS | n/a |
| AC-2 | `update-opencode.sh` falls through to no-redirect branch when `/dev/tty` is not openable | `tests/test_bin_tty_behavioral.sh` (Suite 152) PASS | `bin/update-opencode.sh:186-190` PASS | n/a |
| AC-3 | `install.sh` and `install-opencode.sh` (both sites) likewise fall through | `tests/test_bin_tty_behavioral.sh` (Suite 152) PASS | `bin/install.sh:72-76`, `bin/install-opencode.sh:144-148,151-155` PASS | n/a |
| AC-4 | Interactive shells with an openable `/dev/tty` still redirect stdin at all 4 sites | `tests/test_bin_tty_behavioral.sh` (Suite 152) PASS | `00-verify-packet.md` diffstat PASS | n/a |
| AC-5 | Regression test exists (Suite 151), asserts exec bit + guard idiom, registered in `tests/run-all.sh` and `docs/testing.md` | `tests/test_bin_tty_execbit.py` PASS | `tests/run-all.sh:397-409`, `docs/testing.md:701-703` PASS | n/a |
| AC-6 | Changelog fragment covers both defects and the sibling-site scope extension | manual file inspection PASS | `changelog.d/fix-473-update-opencode-tty-execbit.md:1-4` PASS | n/a |

Security review skipped — `security_sensitive: false`, no auth/api/db/crypto/session path touched.
