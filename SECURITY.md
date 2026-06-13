# Security Policy

## Supported Versions

Team Harness ships as a Claude Code plugin. Only the latest released version
receives security fixes — update with `/th:update` then `/reload-plugins`.

| Version | Supported |
|---------|-----------|
| latest release | yes |
| older releases | no — please update |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

The preferred channel is **GitHub Private Vulnerability Reporting**: go to the
repository's **Security** tab → **Report a vulnerability**. This opens a private
advisory visible only to the maintainers — no email is required, and the report
routes directly into GitHub's coordinated-disclosure workflow.

If private reporting is unavailable, email the maintainer directly at
**mgutiers3012@gmail.com** with the details and steps to reproduce.

We aim to acknowledge a report within a few days and to provide a remediation
timeline after triage.

## What this repository already does

- **`hooks/policy-block.sh`** — a deterministic secret-scan gate that denies
  high-confidence secrets in file writes and in commit commands before they are
  committed (`.env.example` is allowlisted).
- **CI (`.github/workflows/`)** — runs `bash tests/run-all.sh` on every pull
  request and push to `main`; this includes the `policy-block.sh` functional test
  suite.

Team Harness distributes agent prompts, skills, and hooks — it executes no remote
code beyond the installer and the operator-configured MCP servers. Report any
behavior that could leak credentials, exfiltrate data, or bypass a gate.
