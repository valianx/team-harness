#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { belowFloor, classifyFloor, gateDecision, headTreeReader, partitionFindings, readSpecRequirements, runReviewFan } from "../skills/verify/scripts/review-fan.mjs";

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
    required_lenses: overrides.required_lenses ?? ["qa"],
    scope: { kind: "full", prior_anchor: null, paths: ["src/a.js"] },
    ...overrides,
  };
}

/** A lens return: what it is, what it concluded, whether it finished. Nothing correlational. */
function ret(lens, overrides = {}) {
  return { lens, lens_status: "complete", verdict: "pass", findings: [], ...overrides };
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

await check("binds authored requirement headers from the reviewed head, not the checkout", async () => withRepository(async (root) => {
  await commit(root, {
    "openspec/changes/demo/specs/alpha/spec.md": "## ADDED Requirements\n\n### Requirement: Alpha holds\nBody SHALL hold.\n",
    "openspec/changes/demo/specs/beta/spec.md": "### Requirement: Beta holds\nBody MUST hold.\n\n### Requirement: Beta also holds\nMore.\n",
  }, "intent");
  const head = (await run("git", ["-C", root, "rev-parse", "HEAD"])).stdout.trim();

  // The checkout gains a criterion the reviewed head does not carry; it must not be bound.
  await writeFile(path.join(root, "openspec/changes/demo/specs/alpha/spec.md"),
    "### Requirement: Alpha holds\nBody SHALL hold.\n\n### Requirement: Checkout only\nMore.\n");

  const criteria = await readSpecRequirements("openspec/changes/demo/specs", headTreeReader(root, head));
  assert.deepEqual(criteria.map((entry) => entry.text).sort(), ["Alpha holds", "Beta also holds", "Beta holds"]);
  assert.equal(criteria.some((entry) => entry.text === "Checkout only"), false, "a checkout-only criterion was bound");
  assert.equal(criteria.every((entry) => entry.provenance === "written-intent"), true);
  assert.equal(criteria.every((entry) => entry.source.endsWith("spec.md")), true);
}));

await check("binds nothing when the reviewed head carries no spec deltas", async () => withRepository(async (root) => {
  const head = (await run("git", ["-C", root, "rev-parse", "HEAD"])).stdout.trim();
  assert.deepEqual(await readSpecRequirements("openspec/changes/empty/specs", headTreeReader(root, head)), []);
}));

await check("refuses a package when the tree carries untracked files", async () => withRepository(async (root) => {
  await commit(root, { "src/a.js": "export const a = 1;\n" }, "add");
  await writeFile(path.join(root, "stray.txt"), "untracked\n");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
  assert.equal(result.error_code, "WORKTREE_NOT_CLEAN");
}));

await check("reports a finding the authored criteria anticipated as covered", () => {
  const anticipated = pkg({ criteria: [{ text: "Derivation is all-or-nothing", provenance: "written-intent", source: "specs/a/spec.md" }] });
  const decision = gateDecision(anticipated, [ret("qa", { verdict: "fail", findings: [{ file: "src/a.js", criterion: "Derivation is all-or-nothing" }] })]);
  assert.equal(decision.covered.length, 1);
  assert.equal(decision.spec_defects.length, 0);
  assert.equal(decision.covered[0].source, "specs/a/spec.md");
});

await check("reports a finding no criterion anticipated as a spec defect", () => {
  const anticipated = pkg({ criteria: [{ text: "Derivation is all-or-nothing", provenance: "written-intent" }] });
  const decision = gateDecision(anticipated, [ret("qa", { verdict: "fail", findings: [{ file: "src/a.js", criterion: "Decoding never fails open" }] })]);
  assert.equal(decision.spec_defects.length, 1);
  assert.equal(decision.spec_defects[0].coverage, "uncovered");
  assert.equal(decision.covered.length, 0);
});

await check("treats a finding naming no criterion at all as uncovered", () => {
  const decision = gateDecision(pkg({ criteria: [{ text: "Anything", provenance: "written-intent" }] }), [ret("qa", { verdict: "fail", findings: [{ file: "src/a.js" }] })]);
  assert.equal(decision.spec_defects.length, 1);
});

await check("classifies nothing when a package bound no written intent", () => {
  const decision = gateDecision(pkg(), [ret("qa")]);
  assert.deepEqual(decision.covered, []);
  assert.deepEqual(decision.spec_defects, []);
  assert.equal(decision.ready, true);
});

await check("keeps an absent required return from resolving ready", () => {
  const decision = gateDecision(pkg({ required_lenses: ["qa", "security"] }), [ret("qa")]);
  assert.equal(decision.ready, false);
  assert.equal(decision.reasons.some((reason) => reason.includes("security")), true);
});

await check("keeps a blocking floor lens from resolving ready", () => {
  const decision = gateDecision(pkg({ required_lenses: ["adversary"] }), [ret("adversary", { verdict: "fail" })]);
  assert.equal(decision.ready, false);
});

await check("keeps a duplicate return from burying an earlier failure, discarding neither", () => {
  const decision = gateDecision(pkg(), [
    ret("qa", { verdict: "fail", findings: [{ severity: "blocker", file: "src/a.js" }] }),
    ret("qa"),
  ]);
  assert.equal(decision.ready, false, "a later benign return buried an earlier failure");
  assert.equal(decision.spec_defects.length + decision.covered.length, 1, "the earlier finding was discarded");
});

await check("takes the worse outcome regardless of the order the returns arrive in", () => {
  const worstFirst = gateDecision(pkg(), [ret("qa", { verdict: "fail" }), ret("qa")]);
  const worstLast = gateDecision(pkg(), [ret("qa"), ret("qa", { verdict: "fail" })]);
  assert.equal(worstFirst.ready, false);
  assert.equal(worstLast.ready, false);
});

await check("keeps a return for a lens nobody required without letting it decide anything", () => {
  const decision = gateDecision(pkg({ required_lenses: ["qa"] }), [ret("qa"), ret("security", { verdict: "fail" })]);
  assert.equal(decision.ready, true, "an unrequested lens held the ship");
  assert.equal(decision.unrequested.length, 1, "an unrequested return was thrown away instead of kept");
});

await check("holds a non-terminal lens status short of a pass, whatever its verdict", () => {
  for (const status of ["incomplete", "failed", "unavailable", "untrusted"]) {
    const decision = gateDecision(pkg(), [ret("qa", { lens_status: status })]);
    assert.equal(decision.ready, false, status);
    assert.equal(decision.reasons.some((reason) => reason.includes(status)), true, status);
  }
});

await check("asks a lens for nothing it must echo back", async () => withRepository(async (root) => {
  await commit(root, { "src/a.js": "export const a = 1;\n" }, "add");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
  const serialized = JSON.stringify(result.package);
  for (const correlational of ["target_id", "dispatch_id"]) {
    assert.equal(serialized.includes(correlational), false, `the package still carries ${correlational}`);
  }
}));

await check("raises the floor when a change removes a security control at a benign path", async () =>
  withRepository(async (root) => {
    // src/pipeline.js matches no path signal: the removal is only visible through content.
    await commit(root, {
      "src/pipeline.js": "export function run(request) {\n  authorize(request.user);\n  return handle(request);\n}\n",
    }, "add");
    await commit(root, {
      "src/pipeline.js": "export function run(request) {\n  return handle(request);\n}\n",
    }, "drop the check");
    const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
    assert.equal(result.package.security_floor.applies, true, "removing a control raised no floor");
    assert.equal(result.package.required_lenses.includes("security"), true);
    assert.equal(result.package.required_lenses.includes("adversary"), true);
  }));

await check("raises the floor when a whole file carrying a control is deleted", async () =>
  withRepository(async (root) => {
    // A deletion reads `+++ /dev/null`, so the new path is not a path. Attributing the removed
    // lines to the path the file had is what keeps deleting a control from being quieter than
    // editing it out -- the same fail-open in a different shape.
    await commit(root, {
      "src/pipeline.js": "export function run(request) {\n  authorize(request.user);\n  return handle(request);\n}\n",
    }, "add");
    await git(root, ["rm", "-q", "src/pipeline.js"]);
    await git(root, ["commit", "-q", "-m", "delete the whole file"]);
    const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
    assert.equal(result.package.security_floor.applies, true, "deleting the file carrying the control raised no floor");
    assert.equal(result.package.required_lenses.includes("adversary"), true);
  }));

await check("raises the same floor when the same control is added rather than removed", async () =>
  withRepository(async (root) => {
    await commit(root, { "src/pipeline.js": "export function run(request) {\n  return handle(request);\n}\n" }, "add");
    await commit(root, {
      "src/pipeline.js": "export function run(request) {\n  authorize(request.user);\n  return handle(request);\n}\n",
    }, "add the check");
    const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
    assert.equal(result.package.security_floor.applies, true, "the floor depends on the direction of the edit");
  }));

await check("reads a removed line disguised as a --- file header as content, not a header", async () =>
  withRepository(async (root) => {
    // The diff line for this removal is `--- authorize(user) here`, byte-identical in shape to a
    // real `--- a/path` header. A text-matching header rule would stop collecting at it.
    await commit(root, { "src/notes.js": "const a = 1;\n-- authorize(user) here\nconst b = 2;\n" }, "add");
    await commit(root, { "src/notes.js": "const a = 1;\nconst b = 2;\n" }, "drop the line");
    const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
    assert.equal(result.package.security_floor.applies, true, "the disguised removal was read as a file header");
  }));

await check("leaves the floor down when neither direction touches a security control", async () =>
  withRepository(async (root) => {
    await commit(root, { "src/format.js": "export const pad = (n) => String(n).padStart(2, \"0\");\n" }, "add");
    await commit(root, { "src/format.js": "export const pad = (n) => `${n}`.padStart(2, \"0\");\n" }, "rewrite");
    const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
    assert.equal(result.package.security_floor.applies, false, "widening to removals made an ordinary change sensitive");
  }));

await check("resolves ready only when every required lens passes without a blocker", () => {
  const decision = gateDecision(pkg({ required_lenses: ["qa", "tester"] }), [ret("qa"), ret("tester")]);
  assert.equal(decision.ready, true);
  assert.deepEqual(decision.reasons, []);
  assert.deepEqual(decision.unrequested, []);
});

await check("treats a return that omits lens_status as unfinished, not complete", () => {
  // A lens that did not finish and simply left the field out must not read as a completed pass.
  const decision = gateDecision(pkg({ required_lenses: ["qa"] }), [{ lens: "qa", verdict: "pass", findings: [] }]);
  assert.equal(decision.ready, false);
  assert.equal(decision.reasons.some((reason) => reason.includes("no lens_status")), true);
});

await check("holds the range when a lens leaves a blocking disagreement unresolved", () => {
  const decision = gateDecision(pkg({ required_lenses: ["qa"] }), [
    ret("qa", { disagreements: [{ with: "tester", claim: "coverage is not sufficient", blocking: true }] }),
  ]);
  assert.equal(decision.ready, false);
  assert.equal(decision.reasons.some((reason) => reason.includes("blocking disagreement")), true);
});

await check("a disagreement the lens did not mark blocking does not hold the range", () => {
  const decision = gateDecision(pkg({ required_lenses: ["qa"] }), [
    ret("qa", { disagreements: [{ with: "tester", claim: "style", blocking: false }] }),
  ]);
  assert.equal(decision.ready, true);
});

await check("treats a pass carrying blockers as not ready", () => {
  const decision = gateDecision(pkg(), [ret("qa", { findings: [{ file: "src/a.js" }] })]);
  assert.equal(decision.ready, false);
});

await check("demotes a finding outside a delta range to a concern", () => {
  const delta = pkg({ scope: { kind: "delta", prior_anchor: "abcdef1", paths: ["src/a.js"] } });
  const split = partitionFindings(delta, [{ file: "src/unrelated.js" }, { file: "src/a.js" }]);
  assert.equal(split.concerns.length, 1);
  assert.equal(split.blockers.length, 1);
  const decision = gateDecision(delta, [{ ...ret("qa"), findings: [{ file: "src/unrelated.js" }] }]);
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
  const decision = gateDecision(anticipated, [ret("qa", { findings: [{ file: "src/a.js", severity: "low", criterion: "Unrelated" }] })]);
  assert.equal(decision.ready, true);
  assert.equal(decision.concerns.length, 1);
  assert.equal(decision.spec_defects.length, 0);
});

await check("never demotes a finding inside a full-scope package", () => {
  const split = partitionFindings(pkg(), [{ file: "src/anything.js" }]);
  assert.equal(split.blockers.length, 1);
  assert.equal(split.concerns.length, 0);
});

await check("leaves an ambiguous criterion match uncovered rather than binding the wrong one", () => {
  const ambiguous = pkg({ criteria: [
    { text: "Only a successful benign classification may waive the security lens", provenance: "written-intent" },
    { text: "Only a successful benign classification may waive the review lens", provenance: "written-intent" },
  ] });
  const decision = gateDecision(ambiguous, [ret("qa", { verdict: "fail", findings: [{ file: "src/a.js", criterion: "Only a successful benign classification" }] })]);
  assert.equal(decision.covered.length, 0, "an ambiguous match was bound to one arbitrary criterion");
  assert.equal(decision.spec_defects.length, 1);
});

await check("binds an exact criterion match even when another criterion contains it", () => {
  const overlapping = pkg({ criteria: [
    { text: "Validation runs once", provenance: "written-intent" },
    { text: "Validation runs once and a fix closes by executing its oracle", provenance: "written-intent" },
  ] });
  const decision = gateDecision(overlapping, [ret("qa", { verdict: "fail", findings: [{ file: "src/a.js", criterion: "Validation runs once" }] })]);
  assert.equal(decision.covered.length, 1);
  assert.equal(decision.covered[0].criterion, "Validation runs once");
});

await check("does not read a content line beginning with +++ b/ as a file header", async () => {
  const diff = [
    "diff --git a/src/handler.js b/src/handler.js",
    "--- a/src/handler.js",
    "+++ b/src/handler.js",
    "+const doc = `+++ b/docs/notes.md`;",
    "+const apiKey = process.env.API_KEY;",
  ].join("\n");
  const added = new Map();
  let current = null;
  let previous = "";
  for (const line of diff.split("\n")) {
    const isHeader = line.startsWith("+++ ") && (previous.startsWith("--- ") || previous.startsWith("diff --git "));
    if (isHeader) current = line.startsWith("+++ b/") ? line.slice("+++ b/".length).trim() : null;
    else if (current !== null && line.startsWith("+")) added.set(current, `${added.get(current) ?? ""}\n${line}`);
    previous = line;
  }
  assert.deepEqual([...added.keys()], ["src/handler.js"], "an added content line was mistaken for a file header");
  const floor = classifyFloor([{ path: "src/handler.js", change: "m" }], added);
  assert.equal(floor.categories.includes("credentials or secrets"), true, "the credential signal was attributed to a prose file and dropped");
});

await check("refuses a delta scope with no anchor to bound it", async () => withRepository(async (root) => {
  await commit(root, { "src/a.js": "export const a = 1;\n" }, "add");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa", scope: "delta" });
  assert.equal(result.error_code, "ARGUMENT_INVALID");
  const unknown = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa", scope: "partial" });
  assert.equal(unknown.error_code, "ARGUMENT_INVALID");
}));

await check("keeps a blocker on an excluded path from being demoted in a delta package", () => {
  const delta = pkg({ scope: { kind: "delta", prior_anchor: "abcdef1", paths: ["src/a.js"], range_paths: ["src/a.js", "plugins/mirror.md"] } });
  const split = partitionFindings(delta, [{ file: "plugins/mirror.md", severity: "blocker" }]);
  assert.equal(split.blockers.length, 1, "a blocker inside the reviewed range was demoted for being off the review surface");
  const outside = partitionFindings(delta, [{ file: "src/unrelated.js", severity: "blocker" }]);
  assert.equal(outside.concerns.length, 1);
});

await check("marks a surface whose every path a checker proved, instead of emitting an empty change set", () => {
  const split = partitionFindings(pkg(), [{ file: "src/a.js", severity: "high" }]);
  assert.equal(split.blockers.length, 1, "a high-severity finding was demoted below the blocking floor");
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
