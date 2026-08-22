### Fixed

- The adversary report contract now names the `correction-N` target path the pipeline already dispatches. Fixes #571
- The pinned code-hygiene scan now catches plan-artifact identifier tags (`AC-{n}`, `TC-{n}`, `SEC-{n}`) in committed comments. Fixes #497
- Cost reporting no longer reads the never-emitted `tokens_in`/`tokens_out` fields; it derives from the `tokens` total.
- The code-hygiene gate's Layer-2 section no longer carries orphaned text from the retired `code_hygiene` verdict.
