# Cloudflare security provider

Prepare and use the official skill through its maintained installation owner.

## Resolve the installation

The owner is [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill).
Its [installation instructions](https://github.com/cloudflare/security-audit-skill#installation)
use Vercel's Skills CLI. The reviewed upstream revision is
`c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`, observed 2026-11-11.
TH's entry is `cloudflare-security` and the installed upstream name is
`security-audit`. Resolve any existing same-name installation by owner before
changing it. Keep provider files, lock records and methods under upstream ownership.

Resolve **installed**, **discoverable** and **usable** separately through the
CLI's owner records, actual files and active host. Reuse healthy installations.
Choose the established scope, defaulting a new installation to the target project.
Inspect current official help and Node compatibility before preparation.
Skills CLI `1.8.1` requires Node `>=22.20.0`. Its npm version and the upstream
skill revision are separate identities. Record the actual resolved source/hash.

## Install for the active runtime

Run from the target project with the matching agent selector.

| Runtime | `--agent` | Default project skill root |
| --- | --- | --- |
| Codex | `codex` | `.agents/skills/security-audit` |
| Claude Code | `claude-code` | `.claude/skills/security-audit` |
| OpenCode | `opencode` | `.agents/skills/security-audit` |
| Pi | `pi` | `.agents/skills/security-audit` |

Verified Codex project command, with the equivalent selector for other hosts.

```sh
npx --yes skills@1.8.1 add https://github.com/cloudflare/security-audit-skill \
  --skill security-audit --agent codex --yes
```

For selected user scope, add `--global`. `--yes` skips CLI prompts within the
already authorized scope. Inspect destination paths and existing owner records
first. A shared `.agents/skills` root can be discovered by several hosts.
Preserve unrelated installations and resolve custom native roots through actual
CLI output and host discovery. Use the documented `--copy` mode only when needed.

After preparation, inspect `npx --yes skills@1.8.1 list --agent codex --json`
with the actual selector and matching `--global` when applicable. Verify the
source/skill path in the owner's project `skills-lock.json` or global lock, read
the installed `SKILL.md`, and check active native discovery where available.
Missing live discovery stays unverified. Direct loading can apply installed
instructions through the current coordinator when the host permits it.

## Maintain the selected provider

For an explicit project update, use the targeted command from that project.

```sh
npx --yes skills@1.8.1 update security-audit --project --yes
```

Use `--global` in place of `--project` for the selected global installation.
Verify the lock names Cloudflare before updating. The update command has no
agent selector and can refresh shared content and links for other detected
agents. Inspect the actual affected scope and proceed within authorization.
If a narrower runtime-only refresh is needed, use the supported `add` command
with its explicit agent after checking shared-root effects. Preserve usable
work and report any effect outside authorization before dependent maintenance.

## Load upstream instructions and evidence

Read the installed `SKILL.md` and its selected companions directly. Upstream
owns audit phases, attack classes, sandbox requirements, schemas and validators.
Keep its installed files outside TH packages. Follow its exact missing-capability
and incomplete-run contracts, with dummy local validation when supported.
Report installation, native activation and actual audit evidence separately.

Current CLI [options](https://github.com/vercel-labs/skills/blob/v1.8.1/docs/commands.md)
and [agent layouts](https://github.com/vercel-labs/skills/blob/v1.8.1/src/agents.ts)
define supported flags and locations. Use the official owner lifecycle for
updates and preserve the operator's selected target and scope.
