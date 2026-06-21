### Fixed

- Normalized all `hooks/*.sh` to a single committed file mode (`100644`, non-executable), fixing the inconsistency where `hooks/notify-stage.sh` and `hooks/policy-block.sh` were committed as `100755` while the other 15 were `100644` (#397). Every hook is invoked as `bash <path>/hook.sh` by both `.claude-plugin/hooks.json` and `hooks/config.json`, so the executable bit is functionally irrelevant; pinning a consistent mode removes the recurring spurious mode-only `modified` diffs seen under `core.fileMode=true` when a plugin reload re-marks the scripts executable.
