### Security

- **gh-fallback Tier B write blocks: CWE-78 JSON injection hardening (#306).** The five
  `curl`-write fallback paths in `agents/_shared/gh-fallback.md` (create PR, edit PR,
  create issue, edit issue, comment on issue) previously interpolated untrusted
  GitHub-sourced title/body/comment values directly into a shell-quoted
  `--data "{...}"` literal, which allows command injection and malformed JSON when
  the value contains `"`, `\`, newline, or `$(...)`. All five blocks now serialize
  untrusted field values to a temp file via `python3 json.dumps` (values passed as
  argv — never inside a shell string) and pass the file to curl with `--data @file`.
  The serialization idiom mirrors the pattern already used in `orchestrator.md` for
  CWE-78-safe payload construction. The previously safe PR-review submit block
  (`--data @.claude/pr-review-payload.json`) is unchanged.
