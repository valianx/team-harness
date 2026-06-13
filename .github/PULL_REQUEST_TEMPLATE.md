## Summary

<!-- What does this PR change and why? One or two sentences. -->

## Checklist

<!-- See CONTRIBUTING.md and CLAUDE.md §6 for the full rules. -->

- [ ] Branch is off `main` and named `feat|fix|chore|docs|refactor/<kebab>`
- [ ] Commits follow conventional-commit format (`feat(area): …`)
- [ ] Added a `changelog.d/{slug}.md` fragment for any user-facing change
- [ ] If this touches `agents/`, `skills/`, or `hooks/`: bumped the version in
      **both** `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
      (matched semver). If it does not, no bump is needed.
- [ ] `bash tests/run-all.sh` passes locally (exits 0)
- [ ] No secrets, tokens, API keys, `.env` files, or private keys committed
- [ ] Updated `CLAUDE.md` §3/§4 if the tech stack or golden commands changed

## Related issues

<!-- e.g. Closes #123 -->
