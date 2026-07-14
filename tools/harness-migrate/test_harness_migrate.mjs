#!/usr/bin/env node
// tools/harness-migrate/test_harness_migrate.mjs
// Self-contained test suite for the harness-migrate transform.
//
// Oracle: derived from the corrected field-mapping table in 01-plan.md, NOT from
// the implementation. This avoids asserting an implementation bug as correct.
//
// Run: node tools/harness-migrate/test_harness_migrate.mjs
// Exit 0 = all pass, 1 = any fail.
//
// Symlink-escape test is PLATFORM-GATED: on platforms where the fixture cannot be
// created, the assertion skips with a loud logged reason and does NOT count as a pass.
// The ".." traversal sub-case is portable and always runs.

import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as url from "node:url";

import {
  parseFrontmatter,
  serializeFrontmatter,
  detectFormat,
  detectInjectionForm,
  assertNoInjection,
  rejectPollutionKeys,
  transformToOpencode,
  applyModeByRole,
  transformToCC,
  validateOutputPath,
  mkdirPerSegment,
  runTransform,
  ContainmentError,
  InjectionError,
  MarkerContradictionError,
  classifyFileSurface,
  agentToolsToPermissionAllow,
  commandAllowedToolsToPermissionAllow,
  permissionAllowToAgentTools,
  permissionAllowToCommandAllowedTools,
  toProviderPrefixedModel,
  toBareModel,
  DIRECTION_TO_OPENCODE,
  DIRECTION_TO_CC,
  WRITABLE_PREFIXES,
  TIER_ORDER,
  resolveTierMap,
  resolveFamilyForTier,
  resolveConcreteForTier,
  resolveTieredModel,
} from "./migrate.mjs";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${name}${detail ? " — " + detail : ""}`);
    failed++;
    failures.push(`${name}${detail ? ": " + detail : ""}`);
  }
}

function assertThrows(name, fn, expectedType) {
  try {
    fn();
    console.log(`  [FAIL] ${name} — expected throw of ${expectedType?.name || "Error"} but none thrown`);
    failed++;
    failures.push(`${name}: expected throw but none thrown`);
  } catch (err) {
    if (expectedType && !(err instanceof expectedType)) {
      console.log(`  [FAIL] ${name} — thrown ${err.constructor.name} instead of ${expectedType.name}: ${err.message}`);
      failed++;
      failures.push(`${name}: wrong error type`);
    } else {
      console.log(`  [PASS] ${name}`);
      passed++;
    }
  }
}

async function assertThrowsAsync(name, fn, expectedType) {
  try {
    await fn();
    console.log(`  [FAIL] ${name} — expected throw of ${expectedType?.name || "Error"} but none thrown`);
    failed++;
    failures.push(`${name}: expected throw but none thrown`);
  } catch (err) {
    if (expectedType && !(err instanceof expectedType)) {
      console.log(`  [FAIL] ${name} — thrown ${err.constructor.name} instead of ${expectedType.name}: ${err.message}`);
      failed++;
      failures.push(`${name}: wrong error type`);
    } else {
      console.log(`  [PASS] ${name}`);
      passed++;
    }
  }
}

function skipTest(name, reason) {
  // A skip is NOT a pass — it increments the skipped counter and logs loudly.
  console.log(`  [SKIP] ${name} — ${reason}`);
  skipped++;
}

// ---------------------------------------------------------------------------
// Fixtures (oracle-derived, NOT implementation-derived)
// ---------------------------------------------------------------------------

// CC-canonical agent fixture
const CC_AGENT_CONTENT = `---
name: test-agent
description: A test agent for migration tests.
model: claude-opus-4-5
tools: Read, Glob, Grep
color: orange
effort: high
---

This is the agent body. It uses $ARGUMENTS in instructions.
`;

// Expected opencode projection of the agent (oracle)
// - model: ABSENT — opencode agents are model-less so the harness follows the
//   operator's runtime /model pick on any provider (no baked id, no provider lock-in).
// - permission: {read: "allow", glob: "allow", grep: "allow"} (object form, opencode PermissionRuleConfig)
// - mode: subagent (forward-injected)
// - color: warning (orange maps to the opencode "warning" named enum)
// - th-origin: opencode (records the current format; consistent with structural evidence)
const EXPECTED_OPENCODE_AGENT_FM = {
  name: "test-agent",
  description: "A test agent for migration tests.",
  model: undefined,
  permission: { read: "allow", glob: "allow", grep: "allow" },
  mode: "subagent",
  color: "warning",
  "th-origin": "opencode",
};

// CC-canonical command fixture
const CC_COMMAND_CONTENT = `---
description: Run the harness test with arguments.
argument-hint: [run|check]
allowed-tools: Bash(node tools/test.mjs *)
---

Run the test with $ARGUMENTS and report results.
`;

// Expected opencode projection of the command (oracle)
// - permission.allow from allowed-tools
// - $ARGUMENTS preserved (identity)
// - th-origin: opencode (records current format)
const EXPECTED_OPENCODE_COMMAND_FM = {
  description: "Run the harness test with arguments.",
  model: undefined,
  permission: { allow: ["Bash(node tools/test.mjs *)"], ask: [], deny: [] },
  "th-origin": "opencode",
};

// opencode-origin agent fixture with ask/deny (documented-lossy case)
// th-origin: opencode is consistent with the structural evidence (permission object + provider model).
const OPENCODE_AGENT_WITH_ASK_DENY = `---
name: opencode-agent
description: An agent authored in opencode.
model: anthropic/claude-sonnet-4-5
permission:
  allow:
    - Read
    - Write
  ask:
    - Bash
  deny:
    - WebFetch
mode: primary
th-origin: opencode
---

Agent body content.
`;

// ---------------------------------------------------------------------------
// Section 1: Field-mapping primitives (oracle assertions)
// ---------------------------------------------------------------------------

console.log("\n=== Section 1: Field-mapping primitives ===");

assert(
  "model: bare → provider-prefixed",
  toProviderPrefixedModel("claude-opus-4-5") === "anthropic/claude-opus-4-5"
);
assert(
  "model: alias → resolved concrete provider-prefixed id",
  toProviderPrefixedModel("opus") === "anthropic/claude-opus-4-6" &&
    toProviderPrefixedModel("sonnet") === "anthropic/claude-sonnet-4-6" &&
    toProviderPrefixedModel("haiku") === "anthropic/claude-haiku-4-5"
);
assert(
  "model: already-prefixed → identity",
  toProviderPrefixedModel("anthropic/claude-opus-4-5") === "anthropic/claude-opus-4-5"
);
assert(
  "model: provider-prefixed → bare",
  toBareModel("anthropic/claude-opus-4-5") === "claude-opus-4-5"
);
assert(
  "model: bare → bare (identity)",
  toBareModel("claude-opus-4-5") === "claude-opus-4-5"
);
assert(
  "agentTools: comma-string → allow array",
  JSON.stringify(agentToolsToPermissionAllow("Read, Glob, Grep")) === JSON.stringify(["Read", "Glob", "Grep"])
);
assert(
  "agentTools: sparse whitespace → allow array",
  JSON.stringify(agentToolsToPermissionAllow("Read,Glob,Grep")) === JSON.stringify(["Read", "Glob", "Grep"])
);
assert(
  "agentTools: empty → empty array",
  JSON.stringify(agentToolsToPermissionAllow("")) === JSON.stringify([])
);
assert(
  "commandAllowedTools: space-separated → allow array",
  JSON.stringify(commandAllowedToolsToPermissionAllow("Read Write Glob")) === JSON.stringify(["Read", "Write", "Glob"])
);
assert(
  "commandAllowedTools: array → array",
  JSON.stringify(commandAllowedToolsToPermissionAllow(["Read", "Write"])) === JSON.stringify(["Read", "Write"])
);
assert(
  "permissionAllow → agentTools comma-string",
  permissionAllowToAgentTools(["Read", "Glob", "Grep"]) === "Read, Glob, Grep"
);
assert(
  "permissionAllow → commandAllowedTools space-string",
  permissionAllowToCommandAllowedTools(["Bash(node *)", "Read"]) === "Bash(node *) Read"
);

// ---------------------------------------------------------------------------
// Section 2: Frontmatter parser / serializer
// ---------------------------------------------------------------------------

console.log("\n=== Section 2: Frontmatter parser / serializer ===");

{
  const { frontmatter, body } = parseFrontmatter(CC_AGENT_CONTENT);
  assert("parse: name", frontmatter["name"] === "test-agent");
  assert("parse: model", frontmatter["model"] === "claude-opus-4-5");
  assert("parse: tools", frontmatter["tools"] === "Read, Glob, Grep");
  assert("parse: color", frontmatter["color"] === "orange");
  assert("parse: body preserved", body.includes("$ARGUMENTS"));
}

{
  // Roundtrip: parse → serialize → parse produces same frontmatter.
  const { frontmatter: fm1, body: b1 } = parseFrontmatter(CC_AGENT_CONTENT);
  const reserialized = serializeFrontmatter(fm1, b1);
  const { frontmatter: fm2, body: b2 } = parseFrontmatter(reserialized);
  assert("serialize roundtrip: model", fm2["model"] === fm1["model"]);
  assert("serialize roundtrip: tools", fm2["tools"] === fm1["tools"]);
  assert("serialize roundtrip: body", b2 === b1);
}

// ---------------------------------------------------------------------------
// Section 3: Format detection — structural primary, marker secondary
// ---------------------------------------------------------------------------

console.log("\n=== Section 3: Format detection (structural primary) ===");

{
  const { frontmatter } = parseFrontmatter(CC_AGENT_CONTENT);
  assert("detect: CC agent → claude-code", detectFormat(frontmatter, "agents/test.md") === "claude-code");
}

{
  // Opencode agent: has permission object → opencode.
  const fm = { name: "x", model: "anthropic/x", permission: { allow: [] } };
  assert("detect: opencode agent (permission+provider model) → opencode", detectFormat(fm, ".opencode/agents/x.md") === "opencode");
}

{
  // CC command: has allowed-tools key.
  const { frontmatter } = parseFrontmatter(CC_COMMAND_CONTENT);
  assert("detect: CC command → claude-code", detectFormat(frontmatter, ".claude/commands/test.md") === "claude-code");
}

{
  // Forged marker: marker says claude-code but structure shows permission (opencode).
  const fm = {
    name: "x",
    model: "anthropic/x",
    permission: { allow: [] },
    "th-origin": "claude-code",  // contradicts structural evidence
  };
  assertThrows(
    "detect: forged marker (claude-code marker on opencode structure) → MarkerContradictionError",
    () => detectFormat(fm, "test.md"),
    MarkerContradictionError
  );
}

{
  // Forged marker: marker says opencode but structure shows tools/bare model (CC).
  const fm = {
    name: "x",
    model: "claude-opus-4-5",
    tools: "Read",
    "th-origin": "opencode",  // contradicts structural evidence
  };
  assertThrows(
    "detect: forged marker (opencode marker on CC structure) → MarkerContradictionError",
    () => detectFormat(fm, "test.md"),
    MarkerContradictionError
  );
}

{
  // Consistent marker: marker agrees with structural evidence → accepted.
  const fm = {
    name: "x",
    model: "anthropic/x",
    permission: { allow: [] },
    "th-origin": "opencode",
  };
  assert(
    "detect: consistent marker (opencode) → opencode",
    detectFormat(fm, "test.md") === "opencode"
  );
}

// ---------------------------------------------------------------------------
// Section 4: Forward transform — CC → opencode (AC-1, AC-2, AC-3)
// ---------------------------------------------------------------------------

console.log("\n=== Section 4: Forward transform CC → opencode (AC-1, AC-2, AC-3) ===");

{
  // AC-1: agent forward transform
  const fakeRepoRoot = "/repo";
  const result = transformToOpencode("agents/test-agent.md", CC_AGENT_CONTENT, fakeRepoRoot);
  const { frontmatter: fm, body } = parseFrontmatter(result.content);

  assert("AC-1: output path is .opencode/agents/", result.outputPath.includes(path.join(".opencode", "agents")));
  assert("AC-1: agent permission is object form (read, glob, grep)",
    typeof fm["permission"] === "object" &&
    !Array.isArray(fm["permission"]) &&
    fm["permission"]["read"] === "allow" &&
    fm["permission"]["glob"] === "allow" &&
    fm["permission"]["grep"] === "allow"
  );
  assert("AC-1: agent is model-less (no model emitted)", fm["model"] === undefined);
  assert("AC-1: mode is forward-injected", fm["mode"] === "subagent");
  const { body: origBody } = parseFrontmatter(CC_AGENT_CONTENT);
  assert("AC-1: body is verbatim (identity)", body === origBody);
  assert("AC-1: agent key is tools: (NOT allowed-tools:)", fm["tools"] === undefined && fm["permission"] !== undefined);
  assert("AC-2: output uses plural .opencode/agents/ path", !result.outputPath.includes("agent/"));
}

{
  // AC-3: command forward transform — $ARGUMENTS preserved (identity)
  const fakeRepoRoot = "/repo";
  const result = transformToOpencode(".claude/commands/test-cmd.md", CC_COMMAND_CONTENT, fakeRepoRoot);
  const { frontmatter: fm, body } = parseFrontmatter(result.content);

  assert("AC-2: output uses plural .opencode/commands/ path", result.outputPath.includes(path.join(".opencode", "commands")));
  assert("AC-3: allowed-tools → permission.allow", Array.isArray(fm["permission"]?.["allow"]) && fm["permission"]["allow"].length > 0);
  assert("AC-3: $ARGUMENTS preserved verbatim in body", body.includes("$ARGUMENTS"));
  assert("AC-3: no {input} rewrite (identity)", !body.includes("{input}"));
  assert("AC-3: argument-hint not carried to opencode", fm["argument-hint"] === undefined);
}

{
  // SEC-OCM-4: independent fixed-bytes oracle for the forward agent transform.
  // This assertion compares transform output against hand-authored expected bytes —
  // NOT against the transform's own output — so a symmetric bug that corrupts both
  // directions equally would still be caught here.
  //
  // Expected serialised content produced by transformToOpencode for CC_AGENT_CONTENT.
  // Fields ordered: name, description, permission (block object form), mode, color, th-origin.
  // model: ABSENT — opencode agents are model-less (harness follows the operator's /model pick).
  // color: orange maps to opencode "warning" enum.
  // Body starts with a blank line then the CC_AGENT_CONTENT body verbatim.
  const EXPECTED_OPENCODE_AGENT_SERIALISED = [
    "---",
    "name: test-agent",
    "description: A test agent for migration tests.",
    "permission:",
    "  read: allow",
    "  glob: allow",
    "  grep: allow",
    "mode: subagent",
    "color: warning",
    "th-origin: opencode",
    "---",
    "",
    "This is the agent body. It uses $ARGUMENTS in instructions.",
    "",
  ].join("\n");

  const fakeRepoRoot = "/repo";
  const result = transformToOpencode("agents/test-agent.md", CC_AGENT_CONTENT, fakeRepoRoot);
  assert(
    "SEC-OCM-4: forward agent output matches hand-authored expected bytes (independent oracle)",
    result.content === EXPECTED_OPENCODE_AGENT_SERIALISED,
    result.content !== EXPECTED_OPENCODE_AGENT_SERIALISED
      ? `\nActual:\n${result.content}\nExpected:\n${EXPECTED_OPENCODE_AGENT_SERIALISED}`
      : ""
  );
}

// ---------------------------------------------------------------------------
// Section 5: Inverse transform — opencode → CC (AC-4, AC-5)
// ---------------------------------------------------------------------------

console.log("\n=== Section 5: Inverse transform opencode → CC (AC-4, AC-5) ===");

{
  // AC-4: round-trip identity for CC-origin files.
  // Forward: CC_AGENT_CONTENT → opencode projection
  // Inverse: opencode projection → CC reconstruction
  // The reconstruction should produce content that parses to the same frontmatter as the original.
  const fakeRepoRoot = "/repo";
  const forward = transformToOpencode("agents/test-agent.md", CC_AGENT_CONTENT, fakeRepoRoot);
  const inverse = transformToCC(path.join(".opencode", "agents", "test-agent.md"), forward.content, fakeRepoRoot);

  const { frontmatter: origFm } = parseFrontmatter(CC_AGENT_CONTENT);
  const { frontmatter: rtFm, body: rtBody } = parseFrontmatter(inverse.content);

  // model is intentionally NOT preserved through opencode: the forward transform
  // drops it (model-less), so the reverse reconstruction has no model to restore.
  assert("AC-4: round-trip drops model (opencode is model-less)", rtFm["model"] === undefined);
  assert("AC-4: round-trip tools", rtFm["tools"] === origFm["tools"]);
  assert("AC-4: round-trip name", rtFm["name"] === origFm["name"]);
  assert("AC-4: round-trip description", rtFm["description"] === origFm["description"]);
  const { body: expectedBody } = parseFrontmatter(CC_AGENT_CONTENT);
  assert("AC-4: round-trip body", rtBody === expectedBody);
  assert("AC-4: round-trip no th-origin marker in CC output", rtFm["th-origin"] === undefined);
  assert("AC-4: round-trip mode dropped (was injected by forward pass)", rtFm["mode"] === undefined);
}

{
  // AC-5: documented-lossy inverse for opencode-origin files with ask/deny.
  const fakeRepoRoot = "/repo";
  const result = transformToCC(
    path.join(".opencode", "agents", "opencode-agent.md"),
    OPENCODE_AGENT_WITH_ASK_DENY,
    fakeRepoRoot
  );
  assert("AC-5: lossy field is set (non-null)", result.lossy !== null);
  assert("AC-5: lossy mentions ask/deny", result.lossy?.includes("ask") && result.lossy?.includes("deny"));
  // The ask/deny data is NOT silently dropped without notice.
  assert("AC-5: ask/deny reported, not silently dropped", result.lossy && result.lossy.length > 0);
}

// ---------------------------------------------------------------------------
// Section 6: Idempotency (AC-6)
// ---------------------------------------------------------------------------

console.log("\n=== Section 6: Idempotency (AC-6) ===");

{
  // Running transformToOpencode on an already-opencode file should detect it
  // as already in opencode format (structural detection) and not re-transform.
  const fakeRepoRoot = "/repo";
  const forward = transformToOpencode("agents/test-agent.md", CC_AGENT_CONTENT, fakeRepoRoot);
  // The forward result is the opencode content. Its format is "opencode" structurally.
  const { frontmatter: opFm } = parseFrontmatter(forward.content);
  const detectedFmt = detectFormat(opFm, ".opencode/agents/test-agent.md");
  assert("AC-6: forward result detected as opencode (idempotent skip in batch)", detectedFmt === "opencode");
}

{
  // Running transformToCC on an already-CC file: it has tools/bare model → detected CC.
  const { frontmatter: ccFm } = parseFrontmatter(CC_AGENT_CONTENT);
  const detectedFmt = detectFormat(ccFm, "agents/test-agent.md");
  assert("AC-6: CC file detected as claude-code (idempotent skip in batch)", detectedFmt === "claude-code");
}

// ---------------------------------------------------------------------------
// Section 7: Write-path containment (AC-7 — portable subtests)
// ---------------------------------------------------------------------------

console.log("\n=== Section 7: Write-path containment (AC-7) ===");

{
  // AC-7a: ".." traversal is rejected (portable, always runs).
  const fakeRoot = os.tmpdir();
  // A path with ".." that would escape the root.
  const maliciousPath = path.join(fakeRoot, "agents", "..", "..", "etc", "passwd");
  await assertThrowsAsync(
    "AC-7a: path with '..' → ContainmentError",
    () => validateOutputPath(maliciousPath, fakeRoot),
    ContainmentError
  );
}

{
  // AC-7a variant: file name containing ".." as a component.
  const fakeRoot = os.tmpdir();
  const maliciousPath = path.join(fakeRoot, ".opencode", "agents", "..", "..", "evil.md");
  await assertThrowsAsync(
    "AC-7a variant: path traversal via embedded '..' → ContainmentError",
    () => validateOutputPath(maliciousPath, fakeRoot),
    ContainmentError
  );
}

{
  // AC-7d: path outside the writable-prefix allowlist is rejected.
  const fakeRoot = os.tmpdir();
  const outsidePath = path.join(fakeRoot, "some", "other", "dir", "file.md");
  await assertThrowsAsync(
    "AC-7d: path outside writable-prefix allowlist → ContainmentError",
    () => validateOutputPath(outsidePath, fakeRoot),
    ContainmentError
  );
}

{
  // AC-7d: path outside repo root is rejected.
  const fakeRoot = path.join(os.tmpdir(), "fake-repo");
  const outsideRoot = path.join(os.tmpdir(), "other-dir", "file.md");
  await assertThrowsAsync(
    "AC-7d: path outside repo root → ContainmentError",
    () => validateOutputPath(outsideRoot, fakeRoot),
    ContainmentError
  );
}

// AC-7b: symlink-escape test — PLATFORM-GATED.
// On POSIX, create a symlink in the tmp dir that points outside; verify it's rejected.
// On Windows, symlink creation requires elevated privileges or Developer Mode.
// A skip is NOT a pass — logged loudly.
{
  const isWindows = os.platform() === "win32";
  if (isWindows) {
    skipTest(
      "AC-7b: symlink escape → ContainmentError (POSIX symlink)",
      "Windows platform — symlink creation requires elevated privileges. Portable '..' case (AC-7a) always runs."
    );
  } else {
    // Create a temp directory structure with a symlink escape.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hm-sym-test-"));
    const repoRoot = path.join(tmpDir, "fake-repo");
    const agentsDir = path.join(repoRoot, ".opencode", "agents");
    await fs.mkdir(agentsDir, { recursive: true });
    // Create a symlink inside agents/ that points outside the fake repo root.
    const symlinkPath = path.join(agentsDir, "escaped");
    const outsideTarget = path.join(tmpDir, "outside");
    await fs.mkdir(outsideTarget, { recursive: true });
    try {
      await fs.symlink(outsideTarget, symlinkPath);
      // Now try to validate a path that traverses through the symlink.
      const targetPath = path.join(symlinkPath, "evil.md");
      await assertThrowsAsync(
        "AC-7b: symlink escape through intermediate → ContainmentError",
        () => validateOutputPath(targetPath, repoRoot),
        ContainmentError
      );
    } catch (mkErr) {
      if (mkErr.code === "EPERM" || mkErr.code === "EACCES") {
        skipTest(
          "AC-7b: symlink escape → ContainmentError",
          `Cannot create symlink: ${mkErr.message}. Skipped — NOT a pass.`
        );
      } else {
        throw mkErr;
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Section 8: Shell-injection detection (AC-8)
// ---------------------------------------------------------------------------

console.log("\n=== Section 8: Shell-injection detection (AC-8) ===");

{
  // Form (a): inline !` — non-anchored, catches start-of-line AND post-whitespace cases.
  assert("AC-8a: inline !` at start-of-line detected", detectInjectionForm("!\`whoami\`") !== null);
  assert("AC-8a: inline !` after whitespace detected", detectInjectionForm("key=value and !\`whoami\`") !== null);
  assert("AC-8a: inline !` after space detected", detectInjectionForm("text !\`cmd\`") !== null);
  assert("AC-8a: clean text has no injection", detectInjectionForm("just normal text") === null);
}

{
  // Form (b): fenced ```! block opener.
  assert("AC-8b: fenced ```! detected", detectInjectionForm("```!\nsome command\n```") !== null);
  assert("AC-8b: normal fenced block not flagged", detectInjectionForm("```bash\necho hello\n```") === null);
}

{
  // Injection in body is rejected.
  const injectedBodyContent = `---
name: evil
description: test
model: sonnet
---

Some text and !\`whoami\` injection here.
`;
  assertThrows(
    "AC-8: inline injection in body → InjectionError",
    () => {
      const { frontmatter: fm, body } = parseFrontmatter(injectedBodyContent);
      assertNoInjection("evil.md", fm, body);
    },
    InjectionError
  );
}

{
  // Injection in frontmatter value is rejected.
  const injectedFmContent = `---
name: evil
description: a !\`whoami\` injected value
model: sonnet
---

Clean body.
`;
  assertThrows(
    "AC-8: inline injection in frontmatter value → InjectionError",
    () => {
      const { frontmatter: fm, body } = parseFrontmatter(injectedFmContent);
      assertNoInjection("evil.md", fm, body);
    },
    InjectionError
  );
}

{
  // Fenced injection in body is rejected.
  const fencedBodyContent = `---
name: evil
description: test
model: sonnet
---

Normal text.
\`\`\`!
whoami
\`\`\`
More text.
`;
  assertThrows(
    "AC-8: fenced injection in body → InjectionError",
    () => {
      const { frontmatter: fm, body } = parseFrontmatter(fencedBodyContent);
      assertNoInjection("evil.md", fm, body);
    },
    InjectionError
  );
}

{
  // Negative fixture: a file carrying inline injection is rejected by transformToOpencode.
  const injectedSource = `---
name: evil
description: test
model: sonnet
tools: Read
---

Run !\`whoami\` here.
`;
  assertThrows(
    "AC-8: negative fixture — transformToOpencode rejects inline injection",
    () => transformToOpencode("agents/evil.md", injectedSource, "/repo"),
    InjectionError
  );
}

{
  // Negative fixture: fenced injection in source is rejected.
  const fencedSource = `---
name: evil2
description: test
model: sonnet
tools: Read
---

Normal.
\`\`\`!
rm -rf /
\`\`\`
`;
  assertThrows(
    "AC-8: negative fixture — transformToOpencode rejects fenced injection",
    () => transformToOpencode("agents/evil2.md", fencedSource, "/repo"),
    InjectionError
  );
}

// ---------------------------------------------------------------------------
// Section 9: No-secret-leak via allowlist closure (AC-9)
// ---------------------------------------------------------------------------

console.log("\n=== Section 9: No-secret-leak via allowlist closure (AC-9) ===");

{
  // A source file carrying an out-of-allowlist key `secret:` must NOT appear in output.
  const secretSource = `---
name: test-agent
description: test
model: claude-sonnet-4-5
tools: Read
secret: sk-very-secret-token
tags: tag1,tag2
---

Body content.
`;
  const fakeRepoRoot = "/repo";
  const result = transformToOpencode("agents/test-agent.md", secretSource, fakeRepoRoot);
  const { frontmatter: projFm } = parseFrontmatter(result.content);

  assert("AC-9: out-of-allowlist 'secret' key NOT in projected output", projFm["secret"] === undefined);
  assert("AC-9: out-of-allowlist 'tags' key NOT in projected output (allowlist-based, not blacklist)", projFm["tags"] === undefined);
  // Allowlisted keys ARE present.
  assert("AC-9: allowlisted 'name' IS in projected output", projFm["name"] === "test-agent");
  assert("AC-9: allowlisted 'permission' IS in projected output", projFm["permission"] !== undefined);
}

{
  // Prototype-pollution key is rejected.
  const pollutionSource = `---
name: test
description: test
model: claude-sonnet-4-5
__proto__: injected
---

Body.
`;
  assertThrows(
    "AC-9: prototype-pollution key '__proto__' → ContainmentError",
    () => {
      const { frontmatter: fm } = parseFrontmatter(pollutionSource);
      rejectPollutionKeys(fm);
    },
    ContainmentError
  );
}

// ---------------------------------------------------------------------------
// Section 10: Forged-marker fail-closed (AC-10)
// ---------------------------------------------------------------------------

console.log("\n=== Section 10: Forged-marker fail-closed (AC-10) ===");

{
  // Fixture: marker says claude-code, but structure proves opencode (has permission).
  const forgedMarkerFm = {
    name: "x",
    model: "anthropic/claude-opus-4-5",
    permission: { allow: ["Read"] },
    "th-origin": "claude-code",
  };
  assertThrows(
    "AC-10: forged marker (marker=claude-code, structure=opencode) → MarkerContradictionError",
    () => detectFormat(forgedMarkerFm, "some-file.md"),
    MarkerContradictionError
  );
}

{
  // Marker is not matched via body string.includes — the marker is a named frontmatter KEY only.
  // Verify that a body containing the word "claude-code" does not trigger marker logic.
  const bodyWithMarkerLike = `---
name: x
model: claude-opus-4-5
tools: Read
---

This body mentions claude-code and opencode but has no th-origin key.
`;
  const { frontmatter: fm } = parseFrontmatter(bodyWithMarkerLike);
  // Should detect as claude-code by structure (tools + bare model), not by body content.
  assert("AC-10: body text 'claude-code' does not trigger marker logic", detectFormat(fm, "x.md") === "claude-code");
}

// ---------------------------------------------------------------------------
// Section 11: Batch fail-closed (AC-11) — non-vacuous mixed-batch test
// ---------------------------------------------------------------------------

console.log("\n=== Section 11: Batch fail-closed (AC-11) ===");

{
  // SEC-OCM-2: This test exercises the all-or-nothing invariant with a REAL mixed
  // batch: one valid file + one file that fails containment. It runs the transform
  // in non-dry-run mode and asserts:
  //   (a) the valid item's status is "aborted (batch fail-closed)"
  //   (b) the output file for the valid item was NOT written to disk
  //   (c) the bad item is reported as rejected
  //
  // The rejection is induced by a source file that carries inline injection, which
  // triggers a "rejected" status via InjectionError. Both "rejected" and
  // "rejected (containment)" satisfy the batch abort predicate (startsWith("rejected")),
  // so this exercises the real code path.

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hm-batch-fail-"));
  try {
    const agentsDir = path.join(tmpDir, "agents");
    await fs.mkdir(agentsDir, { recursive: true });

    // Good file — would succeed if the batch were clean.
    await fs.writeFile(
      path.join(agentsDir, "good-agent.md"),
      CC_AGENT_CONTENT,
      "utf8"
    );

    // Bad file — carries inline injection; will be "rejected" by assertNoInjection.
    const BAD_CONTENT = "---\nname: bad-agent\ndescription: test\nmodel: claude-sonnet-4-5\ntools: Read\n---\n\nInjected: !\x60whoami\x60\n";
    await fs.writeFile(
      path.join(agentsDir, "bad-agent.md"),
      BAD_CONTENT,
      "utf8"
    );

    // Run the REAL transform (non-dry-run) on the mixed batch.
    const manifest = await runTransform(DIRECTION_TO_OPENCODE, tmpDir, { dryRun: false });

    // The bad agent must appear as rejected.
    const badItem = manifest.find((m) => m.source && m.source.includes("bad-agent.md"));
    assert(
      "AC-11: bad item reported as rejected",
      badItem !== undefined && badItem.status.startsWith("rejected"),
      badItem ? `status was: ${badItem.status}` : "item not found in manifest"
    );

    // The good agent must be aborted, not projected.
    const goodItem = manifest.find((m) => m.source && m.source.includes("good-agent.md"));
    assert(
      "AC-11: good item aborted due to batch fail-closed",
      goodItem !== undefined && goodItem.status === "aborted (batch fail-closed)",
      goodItem ? `status was: ${goodItem.status}` : "item not found in manifest"
    );

    // The output file for the good agent must NOT exist on disk.
    const expectedOutputPath = path.join(tmpDir, ".opencode", "agents", "good-agent.md");
    let outputExists = false;
    try {
      await fs.access(expectedOutputPath);
      outputExists = true;
    } catch {
      outputExists = false;
    }
    assert(
      "AC-11: good item output file NOT written to disk (all-or-nothing invariant)",
      !outputExists,
      outputExists ? `file unexpectedly exists at ${expectedOutputPath}` : ""
    );

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Section 12: No-injection in command wrapper files (AC-8 command files)
// ---------------------------------------------------------------------------

console.log("\n=== Section 12: Command wrapper files contain no injection (AC-8) ===");

{
  // Read the actual CC command wrapper and verify it contains no injection.
  const scriptDir = path.dirname(url.fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..", "..");
  const ccCmdPath = path.join(repoRoot, ".claude", "commands", "harness-migrate.md");
  let ccCmdContent;
  try {
    ccCmdContent = await fs.readFile(ccCmdPath, "utf8");
    const inlineHit = ccCmdContent.includes("!\`");
    const fencedHit = ccCmdContent.includes("```!");
    assert("AC-8: .claude/commands/harness-migrate.md has no inline !` injection", !inlineHit);
    assert("AC-8: .claude/commands/harness-migrate.md has no fenced ```! injection", !fencedHit);
  } catch {
    skipTest("AC-8: .claude/commands/harness-migrate.md not yet present — skipped (will pass post-creation)", "File not found");
  }
}

{
  const scriptDir = path.dirname(url.fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..", "..");
  const opCmdPath = path.join(repoRoot, ".opencode", "commands", "harness-migrate.md");
  let opCmdContent;
  try {
    opCmdContent = await fs.readFile(opCmdPath, "utf8");
    const inlineHit = opCmdContent.includes("!\`");
    const fencedHit = opCmdContent.includes("```!");
    assert("AC-8: .opencode/commands/harness-migrate.md has no inline !` injection", !inlineHit);
    assert("AC-8: .opencode/commands/harness-migrate.md has no fenced ```! injection", !fencedHit);
  } catch {
    skipTest("AC-8: .opencode/commands/harness-migrate.md not yet present — skipped", "File not found");
  }
}

// ---------------------------------------------------------------------------
// Section 13: Surface classification
// ---------------------------------------------------------------------------

console.log("\n=== Section 13: Surface classification ===");

assert("classify: agents/x.md → agent", classifyFileSurface("agents/x.md") === "agent");
assert("classify: .opencode/agents/x.md → agent", classifyFileSurface(".opencode/agents/x.md") === "agent");
assert("classify: .claude/commands/x.md → command", classifyFileSurface(".claude/commands/x.md") === "command");
assert("classify: .opencode/commands/x.md → command", classifyFileSurface(".opencode/commands/x.md") === "command");

// ---------------------------------------------------------------------------
// Section 14: Plural directory assertion (AC-2)
// ---------------------------------------------------------------------------

console.log("\n=== Section 14: Plural directory names (AC-2) ===");

{
  const fakeRoot = "/repo";
  const agentResult = transformToOpencode("agents/test.md", CC_AGENT_CONTENT, fakeRoot);
  assert("AC-2: agent → .opencode/agents/ (plural)", agentResult.outputPath.includes(path.join(".opencode", "agents")));
  assert("AC-2: no singular .opencode/agent/ path", !agentResult.outputPath.replace(/\\/g, "/").includes(".opencode/agent/"));

  const cmdResult = transformToOpencode(".claude/commands/test.md", CC_COMMAND_CONTENT, fakeRoot);
  assert("AC-2: command → .opencode/commands/ (plural)", cmdResult.outputPath.includes(path.join(".opencode", "commands")));
  assert("AC-2: no singular .opencode/command/ path", !cmdResult.outputPath.replace(/\\/g, "/").includes(".opencode/command/"));
}

// ---------------------------------------------------------------------------
// Section 15: Per-provider cost tiering — ragged-tier resolution (AC-3, #424)
// ---------------------------------------------------------------------------

console.log("\n=== Section 15: Ragged-tier resolution (AC-3, #424) ===");

{
  // Fully ragged (single-tier) synthetic provider: only its most expensive
  // tier is curated. Mirrors cmd/install/tier_test.go::
  // TestResolveTierMap_WorstCaseOneModelServesAllTiers_AC3 — the same
  // algorithm, exercised on the JS side via the exported resolveTierMap.
  const singleTierMap = { "ragged-provider": { default: "big-model" } };

  assert(
    "AC-3: single-tier provider — requesting its own tier resolves directly",
    resolveTierMap(singleTierMap, "ragged-provider", "default") === "big-model",
  );
  assert(
    "AC-3: single-tier provider — medium falls back to the more-expensive default (last resort)",
    resolveTierMap(singleTierMap, "ragged-provider", "medium") === "big-model",
  );
  assert(
    "AC-3: single-tier provider — low falls back to the more-expensive default (worst case one model serves all tiers)",
    resolveTierMap(singleTierMap, "ragged-provider", "low") === "big-model",
  );

  // Cheaper neighbor is preferred over a more-expensive one when both exist.
  // Mirrors cmd/install/tier_test.go::TestResolveTierMap_PrefersCheaperOverMoreExpensive_AC3.
  const twoTierMap = { "ragged-provider": { default: "big-model", low: "small-model" } };
  assert(
    "AC-3: requesting medium prefers the cheaper 'low' neighbor over the more-expensive 'default'",
    resolveTierMap(twoTierMap, "ragged-provider", "medium") === "small-model",
  );

  // Unknown provider / unrecognized tier both resolve to null (no guessing).
  assert("AC-3: unknown provider resolves to null", resolveTierMap(singleTierMap, "no-such-provider", "low") === null);
  assert("AC-3: unrecognized tier label resolves to null", resolveTierMap(singleTierMap, "ragged-provider", "ultra") === null);

  assert("TIER_ORDER is most-to-least expensive", TIER_ORDER.join(",") === "default,medium,low");

  // The curated Anthropic map has all three tiers populated today, so the
  // exported convenience wrappers resolve every tier directly (no fallback
  // exercised here — the fallback path itself is proven above against the
  // synthetic ragged map, matching how the curated map will behave once a
  // ragged provider is added).
  assert("resolveFamilyForTier: anthropic/default", resolveFamilyForTier("anthropic", "default") === "claude-opus");
  assert("resolveConcreteForTier: anthropic/low", resolveConcreteForTier("anthropic", "low") === "claude-haiku-4-5");
  assert("resolveTieredModel: opus alias bakes anthropic/claude-opus-4-6", resolveTieredModel("anthropic", "opus") === "anthropic/claude-opus-4-6");
  assert("resolveTieredModel: unrecognized alias returns null", resolveTieredModel("anthropic", "claude-opus-4-6") === null);
}

// ---------------------------------------------------------------------------
// Section 16: Installer-layer role override — leader display rename
// (Task-3 AC-5, AC-6, AC-7)
// ---------------------------------------------------------------------------

console.log("\n=== Section 16: Leader display rename (Task-3 AC-5, AC-6, AC-7) ===");

{
  // applyModeByRole applied directly to an already-projected leader file.
  const leaderInput = `---
name: leader
description: Coordinator.
model: claude-opus-4-5
tools: Read
---

Leader body.
`;
  const projected = transformToOpencode("agents/leader.md", leaderInput, "/fake-repo").content;

  // AC-5: the exported generic transform stays name: leader / mode: subagent
  // for the leader (conformance-fixture-bound; unaffected by the role layer).
  const { frontmatter: genericFm } = parseFrontmatter(projected);
  assert(
    "AC-5: generic transformToOpencode leaves leader as name: leader",
    genericFm["name"] === "leader"
  );
  assert(
    "AC-5: generic transformToOpencode leaves leader as mode: subagent",
    genericFm["mode"] === "subagent"
  );

  // Applying the role layer on top renames + re-modes the leader.
  const roled = applyModeByRole(projected, "leader");
  const { frontmatter: roledFm } = parseFrontmatter(roled);
  assert("Task-3 AC-1: role layer sets name: TH Leader", roledFm["name"] === "TH Leader");
  assert("Task-3 AC-1: role layer sets mode: primary", roledFm["mode"] === "primary");

  // Non-leader agents are returned unchanged by the role layer.
  const orchestratorInput = `---
name: orchestrator
model: sonnet
tools: Read
---

Orchestrator body.
`;
  const orchestratorProjected = transformToOpencode("agents/orchestrator.md", orchestratorInput, "/fake-repo").content;
  const orchestratorRoled = applyModeByRole(orchestratorProjected, "orchestrator");
  assert(
    "Task-3 AC-3: role layer leaves non-leader output byte-identical",
    orchestratorRoled === orchestratorProjected
  );
}

{
  // Full runTransform pipeline: leader.md gets the rename, a non-leader
  // agent does not — exercised end to end through the real batch writer.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hm-role-layer-"));
  try {
    const agentsDir = path.join(tmpDir, "agents");
    await fs.mkdir(agentsDir, { recursive: true });

    await fs.writeFile(
      path.join(agentsDir, "leader.md"),
      `---
name: leader
description: Coordinator.
model: claude-opus-4-5
tools: Read
---

Leader body.
`,
      "utf8"
    );
    await fs.writeFile(path.join(agentsDir, "orchestrator.md"), CC_AGENT_CONTENT.replace("test-agent", "orchestrator"), "utf8");

    const manifest = await runTransform(DIRECTION_TO_OPENCODE, tmpDir, { dryRun: false });
    const leaderItem = manifest.find((m) => m.source && m.source.includes("leader.md"));
    assert(
      "Task-3 AC-5: leader.md projected via runTransform",
      leaderItem !== undefined && leaderItem.status === "projected"
    );

    const leaderOutput = await fs.readFile(path.join(tmpDir, ".opencode", "agents", "leader.md"), "utf8");
    const { frontmatter: leaderOutFm } = parseFrontmatter(leaderOutput);
    assert("Task-3 AC-5: runTransform output has name: TH Leader", leaderOutFm["name"] === "TH Leader");
    assert("Task-3 AC-5: runTransform output has mode: primary", leaderOutFm["mode"] === "primary");

    const orchestratorOutput = await fs.readFile(path.join(tmpDir, ".opencode", "agents", "orchestrator.md"), "utf8");
    const { frontmatter: orchestratorOutFm } = parseFrontmatter(orchestratorOutput);
    assert(
      "Task-3 AC-3: runTransform leaves non-leader name unchanged",
      orchestratorOutFm["name"] === "orchestrator"
    );
    assert(
      "Task-3 AC-3: runTransform leaves non-leader mode: subagent",
      orchestratorOutFm["mode"] === "subagent"
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

{
  // Round-trip: project the leader agent forward (generic + role layer), then
  // project the result back to CC form. The inverse must restore the
  // canonical CC name ("leader") rather than carry through the injected
  // opencode display name ("TH Leader") — the defect found in the dual
  // review of this feature.
  const leaderInput = `---
name: leader
description: Coordinator.
model: claude-opus-4-5
tools: Read
---

Leader body.
`;
  const forwardGeneric = transformToOpencode("agents/leader.md", leaderInput, "/fake-repo").content;
  const forwardRoled = applyModeByRole(forwardGeneric, "leader");
  const { frontmatter: forwardFm } = parseFrontmatter(forwardRoled);
  assert("round-trip fixture: forward pass produced the injected display name", forwardFm["name"] === "TH Leader");

  const back = transformToCC(".opencode/agents/leader.md", forwardRoled, "/fake-repo");
  const { frontmatter: backFm } = parseFrontmatter(back.content);
  assert("round-trip: inverse restores canonical name 'leader', not the injected 'TH Leader'", backFm["name"] === "leader");
  assert("round-trip: inverse does not leak the injected display name", backFm["name"] !== "TH Leader");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("\n============================================================");
console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
if (skipped > 0) {
  console.log(`Note: ${skipped} test(s) skipped (platform-gated). A skip is NOT a pass — see output above for reasons.`);
}
if (failures.length > 0) {
  console.log("\nFailed tests:");
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
}
console.log("============================================================");

process.exit(failed > 0 ? 1 : 0);
