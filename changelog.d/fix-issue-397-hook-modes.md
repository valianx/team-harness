### Fixed

- Normalized `hooks/*.sh` committed file modes to remove the recurring spurious mode-only `modified` diffs seen under `core.fileMode=true` (#397). The 15 hooks invoked purely as `bash <path>/hook.sh` are pinned to `100644` (non-executable), and `hooks/policy-block.sh` was normalized from `100755` to `100644` for the same reason. `hooks/notify-stage.sh` is kept `100755` because the structural test suite (Suite 22) asserts it is executable (`os.access(..., X_OK)`); it is the one hook required to carry the executable bit.
