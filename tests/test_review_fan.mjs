#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { belowFloor, classifyFloor, gateDecision, partitionFindings, readSpecRequirements, runReviewFan } from "../skills/verify/scripts/review-fan.mjs";

const run = promisify(execFile);
const failures = [];

async function git(root, args) {
  await run("git", ["-C", root, ...args], { windowsHide: true });
}

async function commit(root, files, message) {
  for (const [name, body] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-q", "-m", message]);
}

async function withRepository(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "th-review-fan-"));
  try {
    await git(root, ["init", "-q", "-b", "main"]);
    await git(root, ["config", "user.email", "test@example.invalid"]);
    await git(root, ["config", "user.name", "Test"]);
    await commit(root, { "README.md": "base\n" }, "base");
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function check(name, callback) {
  try { await callback(); process.stdout.write(`  [PASS] ${name}\n`); }
  catch (error) { failures.push(name); process.stdout.write(`  [FAIL] ${name}: ${error.message}\n`); }
}

function pkg(overrides = {}) {
  return {
    required_lenses: ["qa"],
    scope: { kind: "full", prior_anchor: null, paths: ["src/a.js"] },
    ...overrides,
  };
}

console.log("=== Inline review fan ===");

await check("refuses a dirty worktree before deriving anything", async () => withRepository(async (root) => {
  await writeFile(path.join(root, "README.md"), "dirty\n");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~0..HEAD", lens: "qa" });
  assert.equal(result.verdict, "fail");
  assert.equal(result.error_code, "WORKTREE_NOT_CLEAN");
  assert.equal(Object.hasOwn(result, "package"), false);
}));

await check("refuses a range whose endpoint is not a commit", async () => withRepository(async (root) => {
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "nosuchref..HEAD", lens: "qa" });
  assert.equal(result.error_code, "RANGE_NOT_COMMITTED");
}));

await check("refuses an unparseable range", async () => withRepository(async (root) => {
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD", lens: "qa" });
  assert.equal(result.error_code, "ARGUMENT_INVALID");
}));

await check("refuses an unknown lens", async () => withRepository(async (root) => {
  await commit(root, { "src/a.js": "export const a = 1;\n" }, "add");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa,wizard" });
  assert.equal(result.error_code, "ARGUMENT_INVALID");
}));

await check("derives the changed surface from the repository, not from the caller", async () => withRepository(async (root) => {
  await commit(root, { "src/a.js": "export const a = 1;\n", "src/b.js": "export const b = 2;\n" }, "add");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
  assert.equal(result.verdict, "pass");
  assert.deepEqual(result.package.changed_surface.map((entry) => entry.path).sort(), ["src/a.js", "src/b.js"]);
  assert.equal(result.package.read_only, true);
}));

await check("forces the floor lenses into the required set when the floor applies", async () => withRepository(async (root) => {
  await commit(root, { "src/auth_service.py": "def authorize(user):\n    return True\n" }, "auth");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
  assert.equal(result.package.security_floor.applies, true);
  assert.deepEqual(result.package.requested_lenses, ["qa"]);
  assert.deepEqual(result.package.required_lenses, ["adversary", "qa", "security"]);
}));

await check("leaves the required set alone when no floor category matches", async () => withRepository(async (root) => {
  await commit(root, { "docs/layout.md": "# Layout\n\nColumns and spacing.\n" }, "docs");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
  assert.equal(result.package.security_floor.applies, false);
  assert.deepEqual(result.package.required_lenses, ["qa"]);
}));

await check("does not derive code-level floor categories from prose wording alone", async () => {
  const surface = [{ path: "docs/notes.md", change: "m" }];
  const added = new Map([["docs/notes.md", "+we reset the password and rotate the session token"]]);
  const floor = classifyFloor(surface, added);
  assert.equal(floor.categories.includes("credentials or secrets"), false);
  assert.equal(floor.categories.includes("identity or session handling"), false);
});

await check("derives the policy category from prose that changes an enforcement rule", async () => {
  const surface = [{ path: "docs/rules.md", change: "m" }];
  const added = new Map([["docs/rules.md", "+the security floor now blocks the ship"]]);
  const floor = classifyFloor(surface, added);
  assert.deepEqual(floor.categories, ["security policy/audit enforcement"]);
  assert.equal(floor.applies, true);
});

await check("derives code-level categories from a non-prose file", async () => {
  const surface = [{ path: "src/session.py", change: "m" }];
  const added = new Map([["src/session.py", "+token = issue_jwt(user)"]]);
  const floor = classifyFloor(surface, added);
  assert.equal(floor.categories.includes("identity or session handling"), true);
});

await check("treats an unscannable path as ambiguous, and ambiguous as sensitive", async () => withRepository(async (root) => {
  await mkdir(path.join(root, "assets"), { recursive: true });
  await writeFile(path.join(root, "assets", "blob.bin"), Buffer.from([0, 1, 2, 0, 255, 0, 7]));
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-q", "-m", "binary"]);
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
  assert.equal(result.package.security_floor.applies, true);
  assert.equal(result.package.security_floor.ambiguous, true);
  assert.deepEqual(result.package.security_floor.categories, []);
  assert.deepEqual(result.package.required_lenses, ["adversary", "qa", "security"]);
}));

await check("leaves a fully scannable change unambiguous", () => {
  const floor = classifyFloor([{ path: "docs/x.md", change: "m" }], new Map(), []);
  assert.equal(floor.ambiguous, false);
  assert.equal(floor.applies, false);
});

await check("refuses a second full-scope package once a prior anchor exists", async () => withRepository(async (root) => {
  await commit(root, { "src/a.js": "export const a = 1;\n" }, "add");
  const anchor = "abcdef1";
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa", priorAnchor: anchor, scope: "full" });
  assert.equal(result.error_code, "SCOPE_FULL_REFUSED");
}));

await check("emits a delta package bounded to the range since the prior anchor", async () => withRepository(async (root) => {
  await commit(root, { "src/a.js": "export const a = 1;\n" }, "first");
  const anchor = (await run("git", ["-C", root, "rev-parse", "HEAD"])).stdout.trim();
  await commit(root, { "src/b.js": "export const b = 2;\n" }, "second");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~2..HEAD", lens: "qa", priorAnchor: anchor });
  assert.equal(result.verdict, "pass");
  assert.equal(result.package.scope.kind, "delta");
  assert.deepEqual(result.package.scope.paths, ["src/b.js"]);
}));

await check("refuses to bind criteria from a change that is not present", async () => withRepository(async (root) => {
  await commit(root, { "src/a.js": "export const a = 1;\n" }, "add");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa", change: "absent-change" });
  assert.equal(result.error_code, "CHANGE_NOT_FOUND");
}));

await check("binds authored requirement headers as written-intent criteria", async () => withRepository(async (root) => {
  const specs = path.join(root, "openspec", "changes", "demo", "specs");
  await mkdir(path.join(specs, "alpha"), { recursive: true });
  await mkdir(path.join(specs, "beta"), { recursive: true });
  await writeFile(path.join(specs, "alpha", "spec.md"), "## ADDED Requirements\n\n### Requirement: Alpha holds\nBody SHALL hold.\n");
  await writeFile(path.join(specs, "beta", "spec.md"), "### Requirement: Beta holds\nBody MUST hold.\n\n### Requirement: Beta also holds\nMore.\n");
  const criteria = await readSpecRequirements(specs);
  assert.deepEqual(criteria.map((entry) => entry.text).sort(), ["Alpha holds", "Beta also holds", "Beta holds"]);
  assert.equal(criteria.every((entry) => entry.provenance === "written-intent"), true);
  assert.equal(criteria.every((entry) => entry.source.endsWith("spec.md")), true);
}));

await check("binds nothing when the change carries no spec deltas", async () => withRepository(async (root) => {
  const specs = path.join(root, "openspec", "changes", "empty", "specs");
  await mkdir(specs, { recursive: true });
  assert.deepEqual(await readSpecRequirements(specs), []);
  assert.deepEqual(await readSpecRequirements(path.join(root, "absent")), []);
}));

await check("reports a finding the authored criteria anticipated as covered", () => {
  const anticipated = pkg({ criteria: [{ text: "Derivation is all-or-nothing", provenance: "written-intent", source: "specs/a/spec.md" }] });
  const decision = gateDecision(anticipated, [
    { lens: "qa", verdict: "fail", findings: [{ file: "src/a.js", criterion: "Derivation is all-or-nothing" }] },
  ]);
  assert.equal(decision.covered.length, 1);
  assert.equal(decision.spec_defects.length, 0);
  assert.equal(decision.covered[0].source, "specs/a/spec.md");
});

await check("reports a finding no criterion anticipated as a spec defect", () => {
  const anticipated = pkg({ criteria: [{ text: "Derivation is all-or-nothing", provenance: "written-intent" }] });
  const decision = gateDecision(anticipated, [
    { lens: "qa", verdict: "fail", findings: [{ file: "src/a.js", criterion: "Decoding never fails open" }] },
  ]);
  assert.equal(decision.spec_defects.length, 1);
  assert.equal(decision.spec_defects[0].coverage, "uncovered");
  assert.equal(decision.covered.length, 0);
});

await check("treats a finding naming no criterion at all as uncovered", () => {
  const decision = gateDecision(pkg({ criteria: [{ text: "Anything", provenance: "written-intent" }] }), [
    { lens: "qa", verdict: "fail", findings: [{ file: "src/a.js" }] },
  ]);
  assert.equal(decision.spec_defects.length, 1);
});

await check("classifies nothing when a package bound no written intent", () => {
  const decision = gateDecision(pkg(), [{ lens: "qa", verdict: "pass", findings: [] }]);
  assert.deepEqual(decision.covered, []);
  assert.deepEqual(decision.spec_defects, []);
  assert.equal(decision.ready, true);
});

await check("keeps an absent required return from resolving ready", () => {
  const decision = gateDecision(pkg({ required_lenses: ["qa", "security"] }), [{ lens: "qa", verdict: "pass" }]);
  assert.equal(decision.ready, false);
  assert.equal(decision.reasons.some((reason) => reason.includes("security")), true);
});

await check("keeps a blocking floor lens from resolving ready", () => {
  const decision = gateDecision(pkg({ required_lenses: ["adversary"] }), [{ lens: "adversary", verdict: "fail" }]);
  assert.equal(decision.ready, false);
});

await check("resolves ready only when every required lens passes without a blocker", () => {
  const decision = gateDecision(pkg({ required_lenses: ["qa", "tester"] }), [
    { lens: "qa", verdict: "pass", findings: [] },
    { lens: "tester", verdict: "pass", findings: [] },
  ]);
  assert.deepEqual(decision, { ready: true, reasons: [], concerns: [], covered: [], spec_defects: [] });
});

await check("treats a pass carrying blockers as not ready", () => {
  const decision = gateDecision(pkg(), [{ lens: "qa", verdict: "pass", findings: [{ file: "src/a.js" }] }]);
  assert.equal(decision.ready, false);
});

await check("demotes a finding outside a delta range to a concern", () => {
  const delta = pkg({ scope: { kind: "delta", prior_anchor: "abcdef1", paths: ["src/a.js"] } });
  const split = partitionFindings(delta, [{ file: "src/unrelated.js" }, { file: "src/a.js" }]);
  assert.equal(split.concerns.length, 1);
  assert.equal(split.blockers.length, 1);
  const decision = gateDecision(delta, [{ lens: "qa", verdict: "pass", findings: [{ file: "src/unrelated.js" }] }]);
  assert.equal(decision.ready, true);
  assert.equal(decision.concerns.length, 1);
});

await check("holds the ship on blocker and high severities", () => {
  for (const severity of ["blocker", "high"]) {
    const split = partitionFindings(pkg(), [{ file: "src/a.js", severity }]);
    assert.equal(split.blockers.length, 1, severity);
  }
});

await check("lets medium, low and info ride as concerns below the floor", () => {
  for (const severity of ["medium", "low", "info"]) {
    const split = partitionFindings(pkg(), [{ file: "src/a.js", severity }]);
    assert.equal(split.concerns.length, 1, severity);
    assert.equal(split.blockers.length, 0, severity);
  }
});

await check("holds the ship when a severity is absent or unrecognized", () => {
  for (const entry of [{ file: "src/a.js" }, { file: "src/a.js", severity: "urgent" }, { file: "src/a.js", severity: 7 }]) {
    assert.equal(partitionFindings(pkg(), [entry]).blockers.length, 1, JSON.stringify(entry));
    assert.equal(belowFloor(entry), false);
  }
});

await check("routes a sub-floor uncovered finding to concerns rather than spec defects", () => {
  const anticipated = pkg({ criteria: [{ text: "Some property", provenance: "written-intent" }] });
  const decision = gateDecision(anticipated, [
    { lens: "qa", verdict: "pass", findings: [{ file: "src/a.js", severity: "low", criterion: "Unrelated" }] },
  ]);
  assert.equal(decision.ready, true);
  assert.equal(decision.concerns.length, 1);
  assert.equal(decision.spec_defects.length, 0);
});

await check("never demotes a finding inside a full-scope package", () => {
  const split = partitionFindings(pkg(), [{ file: "src/anything.js" }]);
  assert.equal(split.blockers.length, 1);
  assert.equal(split.concerns.length, 0);
});

await check("rejects a malformed returns document", async () => withRepository(async (root) => {
  const packagePath = path.join(root, "package.json5");
  await writeFile(packagePath, JSON.stringify(pkg()));
  const returnsPath = path.join(root, "returns.json");
  await writeFile(returnsPath, JSON.stringify([{ lens: "qa", verdict: "maybe" }]));
  const result = await runReviewFan({ subcommand: "gate", package: packagePath, returns: returnsPath });
  assert.equal(result.error_code, "RETURNS_INVALID");
}));

await check("rejects an unknown subcommand", async () => {
  const result = await runReviewFan({ subcommand: "publish" });
  assert.equal(result.error_code, "ARGUMENT_INVALID");
});

if (failures.length > 0) {
  console.error(`${failures.length} review fan checks failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
