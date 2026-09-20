# Team Harness for Codex contributors

This file guides work on Team Harness itself. Consumer installations use the
distributed skills and their native instruction guides.

TH adds workflows to the native general agent. Its purpose is to provide a
shared way of working, using the host's execution, permissions, sandboxing,
approvals, and session controls rather than duplicating them.

Use `spec` for development with written intent, tasks and independent review;
choose `pipeline` when broader coordination helps and the operator wants it.
Use `review-pr` for existing PR reviews and `create-pr` for preparation and
publication. Read the current selected skill rather than relying on instructions
remembered from an older release.

The current agent coordinates. Delegate bounded independent tasks with clear
ownership and use specialist findings as evidence. Reviewers have limited
context; the coordinator judges recommendations, verifies corrections and
continues the authorized objective. Native runtime permissions govern execution.

## Working here

Preserve unrelated and untracked work. Use `rg` for searches and `apply_patch`
for manual edits. Keep secrets, scratch scripts and execution logs outside
tracked product files. Use concise, neutral language and honor user preferences.

Canonical shared roles live in `agents/`, Codex adapters in
`runtime/codex/instructions/`, and skills in `skills/`. Runtime-specific
installation workflows live in their packaged override directories. Generate
distributed copies instead of editing them individually.

After changing role inputs, run `node tools/codex-runtime/generate.mjs`,
`node tools/codex-runtime/generate.mjs --check` and
`node tools/codex-runtime/test_generate.mjs`. Sync skills with
`node tools/codex-runtime/sync-skills.mjs` and run the repository suites
appropriate to the change. Use OpenSpec's lifecycle for relevant product
behavior and include completed archive with implementation in the same PR.
