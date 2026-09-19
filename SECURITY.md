# Security Policy

## Supported Versions

Team Harness ships integrations for Claude Code, Codex, and OpenCode. Only the
latest released version receives security fixes. Use the installed runtime's
Team Harness update and reload workflows to refresh it.

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

- **Native execution permissions** — the host runtime's configured permissions
  govern tool execution. TH supplies workflows and context/observation hooks;
  it does not install permission-interception hooks or promise an equivalent
  deny policy across hosts.
- **CI (`.github/workflows/`)** — runs `bash tests/run-all.sh` on every pull
  request and push to `main`, including retained hook behavior, installation
  preservation, runtime projections, and the shipped-asset security self-scan.

Team Harness distributes agent prompts, skills, hooks, and installation helpers.
Its workflows can invoke native tools and operator-configured services. Report
behavior that could leak credentials, exfiltrate data, or bypass native permissions.
