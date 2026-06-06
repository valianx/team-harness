### Added

- `docs/setup-update-model.md`: documents the setup/update working model — division of labour (`/th:setup` owns operator keys, `/th:update` owns files + flows), the cache-vs-fixed-path propagation model, the self-healing idempotent re-sync property, the author maintenance invariant for new fixed-path artifacts, and the residual seam for newly-introduced operator keys.

### Fixed

- `docs/install.md` § Updating: replaced the incomplete plugin-update instructions (which omitted `claude plugin update` and the fixed-path sync) with the real `/th:update` three-step flow (refresh catalog → download → reload) and a pointer to `docs/setup-update-model.md`.
