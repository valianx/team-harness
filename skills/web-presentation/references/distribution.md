# Portable projects and explicit upgrades

For agents creating or maintaining independently owned consumer projects.

Requirements: Node >=22.12, npm and an explicitly provisioned supported browser
for browser verification. Do not install into the skill tree. Resolve the current
skill root and select a fresh absolute output path:

```bash
node "$skill_root/references/scripts/create-deck.mjs" --template feature --out /absolute/deck
cd /absolute/deck
npm ci
npm run dev
```

Choose `feature`, `integration` or `architecture`. Creation refuses an existing
output directory; inspect an existing deck before editing it. The copied project
contains native Markdown, public assets, scripts, tests and its vendor archive.
The root package/lockfile pin Slidev 53.0.0, the default theme 0.25.0 and
`slidev-addon-harness` 1.0.0. The archive resolves locally under `vendor/`, with no
machine-specific installation path or public kit publication.

`npm run kit:identity` reports the archive version/hash, installed version and
package/lockfile hashes, and rejects a mismatch with the locked archive integrity.

`npm ci` prepares `.gitignore` from package-safe `gitignore.txt` only when absent.
If lifecycle scripts are disabled, run `node scripts/prepare-project.mjs` before
creating generated artifacts. Existing custom ignore rules are preserved.

Updating Team Harness changes future scaffolds; it cannot mutate a copied deck.
For an explicitly requested kit upgrade, retain the prior source/archive,
package.json and lockfile in project version control, record old/new kit versions
and hashes, and replace the project's archive and dependency together. Regenerate
the lockfile through its existing package manager, then validate affected layouts,
focus behavior and static output. Verify unrelated sources/assets are unchanged.
Rollback restores the prior archive, package and lockfile together followed by a
clean dependency install and rebuild. Do not add an automatic upgrade hook.

For kit maintainers, canonical source is `references/kit/`. Regenerate its
deterministic archive with `node references/scripts/pack-kit.mjs`; `--check`
detects stale or missing payload bytes. Runtime projections are generated from
canonical skills. Inspect actual npm and OpenCode emitted payloads as well as
freshness; a source-tree build alone does not prove portable distribution.
