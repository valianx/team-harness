## Summary

<!-- What does this PR change and why? One or two sentences. -->

## Checklist

<!-- See CONTRIBUTING.md and CLAUDE.md §6 for the full rules. -->

- [ ] Branch is off `main` and named `feat|fix|chore|docs|refactor/<kebab>`
- [ ] Commits follow conventional-commit format (`feat(area): …`)
- [ ] If this touches `agents/`, `skills/`, or `hooks/`: bumped the version once in
      all three sites — `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
      `plugins[0].version`, and `CLAUDE.md §3` (matched semver) — and added the
      `## [X.Y.Z]` CHANGELOG section directly in this PR. If it does not touch a
      distributed asset, no bump is needed.
- [ ] Used a `changelog.d/{slug}.md` fragment instead of the direct CHANGELOG
      section only when intentionally batching several changes into one cut
- [ ] `bash tests/run-all.sh` passes locally (exits 0)
- [ ] No secrets, tokens, API keys, `.env` files, or private keys committed
- [ ] Updated `CLAUDE.md` §3/§4 if the tech stack or golden commands changed

## Related issues

<!-- e.g. Closes #123 -->
