## Summary

<!-- What does this PR change and why? One or two sentences. -->

## Checklist

<!-- See CONTRIBUTING.md, AGENTS.md and docs/working-agreements.md for the full rules. -->

- [ ] Work is on a task branch based on `main`, using repository or native-host naming conventions
- [ ] Commits follow conventional-commit format (`feat(area): …`)
- [ ] If this touches a distributed runtime input (`agents/`, `skills/`, `hooks/`,
      `plugins/team-harness/`, `.agents/`, `.codex/`, `runtime/`, `tools/codex-runtime/`,
      `tools/pi-runtime/`, `assets.go`, `installer-assets/`, published `bin/` scripts, or production `cmd/install/`): bumped the version once in all five
      current sites — `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
      `plugins[0].version`, `plugins/team-harness/.codex-plugin/plugin.json`,
      `cmd/install/main.go` `var version`, and root `package.json` (matched semver) — and added the
      `## [X.Y.Z]` CHANGELOG section directly in this PR. If it does not touch a
      distributed asset, no bump is needed.
- [ ] Used a `changelog.d/{slug}.md` fragment instead of the direct CHANGELOG
      section only when intentionally batching several changes into one cut
- [ ] `bash tests/run-all.sh` passes locally (exits 0)
- [ ] Committed release metadata passes `node tools/codex-runtime/version-preflight.mjs --base origin/main --head HEAD`
- [ ] No secrets, tokens, API keys, `.env` files, or private keys committed
- [ ] Updated the relevant lifecycle or testing documentation if the tech stack or verification commands changed

## Related issues

<!-- e.g. Closes #123 -->
