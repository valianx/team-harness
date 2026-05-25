Analyze the input: $ARGUMENTS

---

## Mode 1 — Project or area provided

Examples: `/th:security`, `/th:security auth`, `/th:security api`, `/th:security dependencies`

1. Parse the input:
   - If no arguments: full audit of the current project
   - If arguments present: focused audit of the specified area (e.g., "auth", "api", "dependencies", "frontend", "backend")

2. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: security
   - Scope: {full / focused}
   - Area: {area specified by user, or "full project"}
   - Feature: {feature-name from workspaces if in pipeline context, or "security-audit"}
   ```

## Mode 2 — No input provided

1. Perform a full security audit of the current project.
2. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: security
   - Scope: full
   - Area: full project
   - Feature: security-audit
   ```

---

## Important

- Always invoke the `orchestrator` agent — do NOT invoke the `security` agent directly
- The orchestrator will route to the `security` agent
- Output: `workspaces/{feature-name}/04-security.md`
- The security agent performs static analysis using Glob, Grep, and Read — no Bash required
- Report is written in Spanish with OWASP Top 10 2025 and CWE Top 25 2025 coverage
