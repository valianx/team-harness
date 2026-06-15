### Added

- `/th:eval` Mode 5 `--spec`: treat a scenario as an authored quality contract with a pre-declared pass-bar declaration; the `--spec` mode parses the pass-bar section and sets the pass/fail threshold before running.
- `/th:eval --k N`: run a scenario N times and report the aggregate pass-rate `P/k` and pass@k verdict. Default `--k 1` preserves today's single-run cost. Cost: ≈ N × ~$1 per run (paid, operator-invoked only).
- `/th:eval --baseline <sha>`: compare results against a committed baseline at `eval-scenarios/.baselines/{agent}.json` and report NEW failures vs that SHA only.
- `eval-scenarios/` directory with `README.md` (spec format + baseline schema docs), `_templates/spec.md` (spec scenario template with required sections including pass-bar declaration), `eval-scenarios/architect/design-as-spec.md` (worked spec example), and `eval-scenarios/.baselines/architect.example.json` (example baseline matching the schema).
- Suite 95 (`eval-as-spec`) in `tests/test_agent_structure.py`: 20 structural checks asserting arg contracts, report shape, spec template sections, baseline schema, and cost-boundary guarantee — no agent invocations, pure text/JSON reads.
