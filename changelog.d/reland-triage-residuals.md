### Fixed

- The adversary report contract now names the `correction-N` target path the pipeline already dispatches. Fixes #571
- The pinned code-hygiene scan now catches plan-artifact identifier tags (`AC-{n}`, `TC-{n}`, `SEC-{n}`) in committed comments. Fixes #497
- The code-hygiene gate's Layer-2 section no longer carries orphaned text from the retired `code_hygiene` verdict.

### Removed

- The USD cost path on the legacy branch — the `pricing` key, its price table, and the model-tier classification that priced nothing.
- The never-emitted `tokens_in`/`tokens_out` fields and the cost formula that read them.
- The token-estimation heuristic and `tokens_estimated`: an unreported count is now left absent instead of being invented from elapsed time.

### Changed

- `phase.end` tokens are optional observability, never gate evidence; a phase with no reported count renders `—` and adds nothing.
- `/th:trace --cost` is now `/th:trace --tokens` and reports tokens by agent and phase; `--cost` still works as a legacy alias.
