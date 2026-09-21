#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { belowFloor, classifyFloor, findingFiles, findingLocationIssues, gateDecision, headTreeReader, partitionFindings, readSpecRequirements, reviewSummary, runReviewFan } from "../skills/verify/scripts/review-fan.mjs";

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
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function withOpenSpecTransportFixture(expectedChange, callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "th-openspec-transport-"));
  const previousPath = process.env.PATH;
  const previousPathKey = process.env.Path;
  const previousProbeReceipt = process.env.TH_OPENSPEC_PROBE_RECEIPT;
  const expectedArgs = [
    "--yes", "@fission-ai/openspec@1.9.0", "validate", expectedChange,
    "--type", "change", "--strict",
  ];
  const probe = `
const fs = require("node:fs");
const path = require("node:path");
const expected = ${JSON.stringify(expectedArgs)};
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(expected)) process.exit(42);
const change = expected[3];
const changeRoot = path.join(process.cwd(), "openspec", "changes", ...change.split("/"));
const inputs = [
  path.join(process.cwd(), "openspec", "config.yaml"),
  path.join(changeRoot, "proposal.md"),
  path.join(changeRoot, "tasks.md"),
  path.join(changeRoot, "specs", "alpha", "spec.md"),
  path.join(process.cwd(), "openspec", "specs", "alpha", "spec.md"),
];
const receipt = process.env.TH_OPENSPEC_PROBE_RECEIPT;
if (receipt) fs.appendFileSync(receipt, process.cwd() + "\\n", "utf8");
// A validator must never mutate the reviewed checkout. The marker also lets the test
// confirm that a temporary validation root was removed after the child exits.
fs.writeFileSync(path.join(process.cwd(), ".openspec-validation-probe"), process.cwd() + "\\n", "utf8");
let contents = "";
try {
  contents = inputs.map((file) => fs.readFileSync(file, "utf8")).join("\\n");
} catch {
  process.exit(43);
}
if (contents.includes("INVALID_CHANGE") || contents.includes("INVALID_CONFIG") || contents.includes("INVALID_LIVING_SPEC")) process.exit(44);
`;
  try {
    const unixNpx = path.join(directory, "npx");
    await writeFile(unixNpx, `#!/usr/bin/env node\n${probe}`);
    await chmod(unixNpx, 0o755);
    const windowsNpx = path.join(directory, "node_modules", "npm", "bin", "npx-cli.js");
    await mkdir(path.dirname(windowsNpx), { recursive: true });
    await writeFile(windowsNpx, probe);
    const pathValue = `${directory}${path.delimiter}${previousPath ?? ""}`;
    process.env.PATH = pathValue;
    process.env.Path = pathValue;
    const probeReceipt = path.join(directory, "validator-cwds.log");
    process.env.TH_OPENSPEC_PROBE_RECEIPT = probeReceipt;
    return await callback({ probeReceipt });
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousPathKey === undefined) delete process.env.Path;
    else process.env.Path = previousPathKey;
    if (previousProbeReceipt === undefined) delete process.env.TH_OPENSPEC_PROBE_RECEIPT;
    else process.env.TH_OPENSPEC_PROBE_RECEIPT = previousProbeReceipt;
    await rm(directory, { recursive: true, force: true });
  }
}

async function assertOpenSpecValidationDidNotTouchCheckout(root, probeReceipt) {
  const status = (await run("git", ["-C", root, "status", "--porcelain=v1", "--untracked-files=all"], { windowsHide: true })).stdout.trim();
  assert.equal(status, "", "OpenSpec validation left changes in the reviewed checkout");
  await assert.rejects(stat(path.join(root, ".openspec-validation-probe")), { code: "ENOENT" });
  const observed = (await readFile(probeReceipt, "utf8")).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(observed.length > 0, "the transport fixture did not observe a validation cwd");
  assert.ok(observed.every((cwd) => cwd !== root), "validation ran against the mutable checkout");
  for (const cwd of observed) {
    await assert.rejects(stat(cwd), { code: "ENOENT" });
  }
}

function changeInputs(change, { invalid = null } = {}) {
  const root = `openspec/changes/${change}`;
  const marker = invalid === "change" ? "INVALID_CHANGE\n" : "";
  const configMarker = invalid === "config" ? "INVALID_CONFIG\n" : "";
  const livingMarker = invalid === "living" ? "INVALID_LIVING_SPEC\n" : "";
  return {
    "openspec/config.yaml": `name: review-fan-fixture\n${configMarker}`,
    [`${root}/proposal.md`]: "# Review fan fixture\n",
    [`${root}/tasks.md`]: "- [ ] Validate the change\n",
    [`${root}/specs/alpha/spec.md`]: `### Requirement: Reviewed requirement\nThe reviewed head SHALL validate.\n${marker}`,
    "openspec/specs/alpha/spec.md": `### Requirement: Living requirement\nThe living spec SHALL remain coherent.\n${livingMarker}`,
  };
}

async function validateAnchoredChange({ change, reviewedInvalid = null, laterState }) {
  return withRepository(async (root) => {
    await commit(root, changeInputs(change, { invalid: reviewedInvalid }), "reviewed OpenSpec change");
    const reviewedHead = (await run("git", ["-C", root, "rev-parse", "HEAD"], { windowsHide: true })).stdout.trim();
    if (laterState === "missing") {
      await run("git", ["-C", root, "rm", "-q", "-r", `openspec/changes/${change}`], { windowsHide: true });
      await git(root, ["commit", "-q", "-m", "remove the checkout change"]);
    } else {
      await commit(root, changeInputs(change, {
        invalid: laterState === "invalid" ? "change" : null,
      }), "change the checkout after review");
    }

    return withOpenSpecTransportFixture(change, async ({ probeReceipt }) => {
      const result = await runReviewFan({
        subcommand: "package",
        repoRoot: root,
        range: `${reviewedHead}~1..${reviewedHead}`,
        lens: "qa",
        change,
      });
      await assertOpenSpecValidationDidNotTouchCheckout(root, probeReceipt);
      return result;
    });
  });
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

await check("keeps risk signals advisory when a changed path looks sensitive", async () => withRepository(async (root) => {
  await commit(root, { "src/auth_service.py": "def authorize(user):\n    return True\n" }, "auth");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
  assert.equal(result.package.risk_signals.applies, true);
  assert.deepEqual(result.package.requested_lenses, ["qa"]);
  assert.deepEqual(result.package.required_lenses, ["qa"]);
}));

await check("leaves the required set alone when no floor category matches", async () => withRepository(async (root) => {
  await commit(root, { "docs/layout.md": "# Layout\n\nColumns and spacing.\n" }, "docs");
  const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
  assert.equal(result.package.risk_signals.applies, false);
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
  assert.equal(result.package.risk_signals.applies, true);
  assert.equal(result.package.risk_signals.ambiguous, true);
  assert.deepEqual(result.package.risk_signals.categories, []);
  assert.deepEqual(result.package.required_lenses, ["qa"]);
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

await check("refuses to bind criteria from an active or archived change that is not present", async () => withRepository(async (root) => {
  await commit(root, { "src/a.js": "export const a = 1;\n" }, "add");
  for (const change of ["absent-change", "archive/2026-09-14-missing-change"]) {
    const result = await runReviewFan({
      subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa", change,
    });
    assert.equal(result.error_code, "CHANGE_NOT_FOUND");
  }
}));

await check("binds criteria from an archived change in the reviewed head", async () => withRepository(async (root) => {
  const change = "archive/2026-09-14-archived-review";
  await commit(root, {
    "openspec/config.yaml": "name: archived-review-fixture\n",
    [`openspec/changes/${change}/proposal.md`]: "# Archived review fixture\n",
    [`openspec/changes/${change}/tasks.md`]: "- [ ] Validate the archived change\n",
    [`openspec/changes/${change}/specs/alpha/spec.md`]: "### Requirement: Archived holds\nBody SHALL hold.\n",
    "openspec/specs/alpha/spec.md": "### Requirement: Archived living holds\nBody SHALL hold.\n",
    "src/a.js": "export const a = 1;\n",
  }, "archive review change");
  const reviewedHead = (await run("git", ["-C", root, "rev-parse", "HEAD"])).stdout.trim();
  await commit(root, {
    [`openspec/changes/${change}/specs/alpha/spec.md`]: "### Requirement: Archived holds\nBody SHALL hold.\n\n### Requirement: Checkout only\nMore.\n",
  }, "change the checkout after the reviewed head");
  const result = await withOpenSpecTransportFixture(change, async ({ probeReceipt }) => {
    const result = await runReviewFan({
      subcommand: "package",
      repoRoot: root,
      range: `${reviewedHead}~1..${reviewedHead}`,
      lens: "qa",
      change,
    });
    await assertOpenSpecValidationDidNotTouchCheckout(root, probeReceipt);
    return result;
  });
  assert.equal(result.verdict, "pass");
  assert.deepEqual(result.package.criteria.map((entry) => entry.text), ["Archived holds"]);
  assert.equal(result.package.criteria[0].source, `openspec/changes/${change}/specs/alpha/spec.md`);
}));

for (const change of ["anchored-review", "archive/2026-09-14-anchored-review"]) {
  await check(`validates the ${change.startsWith("archive/") ? "archived" : "active"} change from the reviewed head when the checkout is invalid`, async () => {
    const result = await validateAnchoredChange({ change, laterState: "invalid" });
    assert.equal(result.verdict, "pass");
    assert.deepEqual(result.package.criteria.map((entry) => entry.text), ["Reviewed requirement"]);
  });

  await check(`validates the ${change.startsWith("archive/") ? "archived" : "active"} change from the reviewed head when the checkout is missing it`, async () => {
    const result = await validateAnchoredChange({ change, laterState: "missing" });
    assert.equal(result.verdict, "pass");
    assert.deepEqual(result.package.criteria.map((entry) => entry.text), ["Reviewed requirement"]);
  });

  await check(`rejects an invalid ${change.startsWith("archive/") ? "archived" : "active"} reviewed change even when the checkout is valid`, async () => {
    const result = await validateAnchoredChange({ change, reviewedInvalid: "change", laterState: "valid" });
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "CHANGE_NOT_VALIDATED");
  });

  for (const invalidInput of ["config", "living"]) {
    await check(`rejects an invalid ${invalidInput} from the reviewed ${change.startsWith("archive/") ? "archived" : "active"} head even when the checkout is valid`, async () => {
      const result = await validateAnchoredChange({ change, reviewedInvalid: invalidInput, laterState: "valid" });
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "CHANGE_NOT_VALIDATED");
    });
  }
}

await check("rejects reviewed directories that would collapse on a case-insensitive filesystem", async () => withRepository(async (root) => {
  const change = "case-alias-review";
  await commit(root, changeInputs(change), "valid change");
  const base = (await run("git", ["-C", root, "rev-parse", "HEAD"], { windowsHide: true })).stdout.trim();
  const blob = (await run("git", ["-C", root, "rev-parse", `${base}:README.md`], { windowsHide: true })).stdout.trim();
  // Build the conflicting tree in Git without relying on host filename semantics.
  for (const name of ["openspec/schemas/Example/a.yaml", "openspec/schemas/example/b.yaml"]) {
    await git(root, ["update-index", "--add", "--cacheinfo", `100644,${blob},${name}`]);
  }
  await git(root, ["commit", "-q", "-m", "conflicting directory names"]);
  const head = (await run("git", ["-C", root, "rev-parse", "HEAD"], { windowsHide: true })).stdout.trim();
  await git(root, ["reset", "--hard", base]);
  await withOpenSpecTransportFixture(change, async ({ probeReceipt }) => {
    const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: `${base}..${head}`, lens: "qa", change });
    assert.equal(result.error_code, "CHANGE_NOT_VALIDATED");
    await assert.rejects(stat(probeReceipt), { code: "ENOENT" });
    const status = (await run("git", ["-C", root, "status", "--porcelain"], { windowsHide: true })).stdout.trim();
    assert.equal(status, "");
  });
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
  const summary = reviewSummary(anticipated, [ret("qa", { verdict: "fail", findings: [{ file: "src/a.js", criterion: "Derivation is all-or-nothing" }] })]);
  assert.equal(summary.covered.length, 1);
  assert.equal(summary.covered[0].source, "specs/a/spec.md");
  assert.equal(Object.hasOwn(summary, "ready"), false);
});

await check("keeps a finding with unknown criterion coverage for Main", () => {
  const anticipated = pkg({ criteria: [{ text: "Derivation is all-or-nothing", provenance: "written-intent" }] });
  const summary = reviewSummary(anticipated, [ret("qa", { verdict: "fail", findings: [{ file: "src/a.js", criterion: "Decoding never fails open" }] })]);
  assert.equal(summary.unknown_coverage.length, 1);
  assert.equal(summary.unknown_coverage[0].coverage, "unknown");
  assert.equal(summary.covered.length, 0);
});

await check("treats a finding naming no criterion at all as unknown coverage", () => {
  const summary = reviewSummary(pkg({ criteria: [{ text: "Anything", provenance: "written-intent" }] }), [ret("qa", { verdict: "fail", findings: [{ file: "src/a.js" }] })]);
  assert.equal(summary.unknown_coverage.length, 1);
  assert.equal(Object.hasOwn(summary, "ready"), false);
});

await check("treats an empty or whitespace criterion as unknown coverage", () => {
  for (const criterion of ["", "   "]) {
    const summary = reviewSummary(pkg({ criteria: [{ text: "Anything", provenance: "written-intent" }] }), [
      ret("qa", { verdict: "fail", findings: [{ file: "src/a.js", criterion }] }),
    ]);
    assert.equal(summary.covered.length, 0, criterion);
    assert.equal(summary.unknown_coverage.length, 1, criterion);
  }
});

await check("classifies nothing when a package bound no written intent", () => {
  const summary = reviewSummary(pkg(), [ret("qa")]);
  assert.deepEqual(summary.covered, []);
  assert.deepEqual(summary.unknown_coverage, []);
  assert.equal(Object.hasOwn(summary, "ready"), false);
});

await check("records an absent selected return without resolving publication", () => {
  const summary = reviewSummary(pkg({ required_lenses: ["qa", "security"] }), [ret("qa")]);
  assert.deepEqual(summary.missing, ["security"]);
  assert.equal(summary.observations.some((reason) => reason.includes("selected lens security")), true);
  assert.equal(Object.hasOwn(summary, "ready"), false);
});

await check("keeps a blocking floor lens as evidence for Main", () => {
  const summary = reviewSummary(pkg({ required_lenses: ["adversary"] }), [ret("adversary", { verdict: "fail" })]);
  assert.equal(summary.lens_results[0].outcome.verdict, "fail");
  assert.equal(summary.observations.some((reason) => reason.includes("lens adversary returned fail")), true);
  assert.equal(Object.hasOwn(summary, "ready"), false);
});

await check("keeps findings from duplicate returns without burying an earlier failure", () => {
  const summary = reviewSummary(pkg(), [
    ret("qa", { verdict: "fail", findings: [{ severity: "blocker", file: "src/a.js" }] }),
    ret("qa"),
  ]);
  assert.equal(summary.lens_results[0].returns.length, 2);
  assert.equal(summary.lens_results[0].outcome.verdict, "fail", "a later benign return buried an earlier failure");
  assert.equal(summary.unknown_coverage.length + summary.covered.length, 1, "the earlier finding was discarded");
  assert.equal(Object.hasOwn(summary, "ready"), false);
});

await check("takes the worse outcome regardless of the order the returns arrive in", () => {
  const worstFirst = reviewSummary(pkg(), [ret("qa", { verdict: "fail" }), ret("qa")]);
  const worstLast = reviewSummary(pkg(), [ret("qa"), ret("qa", { verdict: "fail" })]);
  assert.equal(worstFirst.lens_results[0].outcome.verdict, "fail");
  assert.equal(worstLast.lens_results[0].outcome.verdict, "fail");
});

await check("keeps derived evidence stable when lenses arrive in a different order", () => {
  const qa = ret("qa", { findings: [{ severity: "high", path: "src/qa.js", line: 2 }] });
  const security = ret("security", { findings: [{ severity: "high", path: "src/security.js", line: 3 }] });
  const first = reviewSummary(pkg({ required_lenses: ["qa", "security"] }), [qa, security]);
  const second = reviewSummary(pkg({ required_lenses: ["qa", "security"] }), [security, qa]);
  assert.deepEqual(first, second, "return order changed derived summary evidence");
});

await check("takes the higher-severity finding regardless of duplicate return order", () => {
  const medium = ret("qa", { findings: [{ severity: "medium", file: "src/medium.js" }] });
  const high = ret("qa", { findings: [{ severity: "high", file: "src/high.js" }] });
  const mediumFirst = reviewSummary(pkg(), [medium, high]);
  const highFirst = reviewSummary(pkg(), [high, medium]);
  assert.deepEqual(mediumFirst.unknown_coverage.map(({ finding }) => finding.file), ["src/high.js"]);
  assert.deepEqual(highFirst.unknown_coverage.map(({ finding }) => finding.file), ["src/high.js"]);
  assert.deepEqual(mediumFirst.concerns.map((finding) => finding.file), ["src/medium.js"]);
  assert.deepEqual(highFirst.concerns.map((finding) => finding.file), ["src/medium.js"]);
  assert.deepEqual(mediumFirst.lens_results[0].outcome, highFirst.lens_results[0].outcome, "duplicate return order changed the consolidated outcome");
  assert.notDeepEqual(mediumFirst.lens_results[0].returns, highFirst.lens_results[0].returns, "raw return order was not preserved");
});

await check("keeps a return for an unselected lens without letting it decide anything", () => {
  const summary = reviewSummary(pkg({ required_lenses: ["qa"] }), [ret("qa"), ret("security", { verdict: "fail" })]);
  assert.equal(summary.unrequested.length, 1, "an unselected return was thrown away instead of kept");
  assert.equal(summary.lens_results.some((result) => result.lens === "security"), true);
  assert.equal(Object.hasOwn(summary, "ready"), false);
});

await check("records a non-terminal lens status as evidence", () => {
  for (const status of ["incomplete", "failed", "unavailable", "untrusted"]) {
    const summary = reviewSummary(pkg(), [ret("qa", { lens_status: status })]);
    assert.equal(summary.observations.some((reason) => reason.includes(status)), true, status);
    assert.equal(Object.hasOwn(summary, "ready"), false);
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
    assert.equal(result.package.risk_signals.applies, true, "removing a control produced no risk signal");
    assert.deepEqual(result.package.required_lenses, ["qa"]);
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
    assert.equal(result.package.risk_signals.applies, true, "deleting the file carrying the control produced no risk signal");
    assert.deepEqual(result.package.required_lenses, ["qa"]);
  }));

await check("raises the same floor when the same control is added rather than removed", async () =>
  withRepository(async (root) => {
    await commit(root, { "src/pipeline.js": "export function run(request) {\n  return handle(request);\n}\n" }, "add");
    await commit(root, {
      "src/pipeline.js": "export function run(request) {\n  authorize(request.user);\n  return handle(request);\n}\n",
    }, "add the check");
    const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
    assert.equal(result.package.risk_signals.applies, true, "the risk signal depends on the direction of the edit");
  }));

await check("reads a removed line disguised as a --- file header as content, not a header", async () =>
  withRepository(async (root) => {
    // The diff line for this removal is `--- authorize(user) here`, byte-identical in shape to a
    // real `--- a/path` header. A text-matching header rule would stop collecting at it.
    await commit(root, { "src/notes.js": "const a = 1;\n-- authorize(user) here\nconst b = 2;\n" }, "add");
    await commit(root, { "src/notes.js": "const a = 1;\nconst b = 2;\n" }, "drop the line");
    const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
    assert.equal(result.package.risk_signals.applies, true, "the disguised removal was read as a file header");
  }));

await check("leaves the floor down when neither direction touches a security control", async () =>
  withRepository(async (root) => {
    await commit(root, { "src/format.js": "export const pad = (n) => String(n).padStart(2, \"0\");\n" }, "add");
    await commit(root, { "src/format.js": "export const pad = (n) => `${n}`.padStart(2, \"0\");\n" }, "rewrite");
    const result = await runReviewFan({ subcommand: "package", repoRoot: root, range: "HEAD~1..HEAD", lens: "qa" });
    assert.equal(result.package.risk_signals.applies, false, "widening to removals made an ordinary change sensitive");
  }));

await check("summarizes selected passes without resolving publication", () => {
  const summary = reviewSummary(pkg({ required_lenses: ["qa", "tester"] }), [ret("qa"), ret("tester")]);
  assert.equal(summary.lens_results.length, 2);
  assert.deepEqual(summary.observations, []);
  assert.deepEqual(summary.unrequested, []);
  assert.equal(Object.hasOwn(summary, "ready"), false);
});

await check("records a return that omits lens_status as unfinished", () => {
  // A lens that did not finish and simply left the field out must not read as a completed pass.
  const summary = reviewSummary(pkg({ required_lenses: ["qa"] }), [{ lens: "qa", verdict: "pass", findings: [] }]);
  assert.equal(summary.observations.some((reason) => reason.includes("no lens_status")), true);
});

await check("records a blocking disagreement for Main to resolve", () => {
  const summary = reviewSummary(pkg({ required_lenses: ["qa"] }), [
    ret("qa", { disagreements: [{ with: "tester", claim: "coverage is not sufficient", blocking: true }] }),
  ]);
  assert.equal(summary.observations.some((reason) => reason.includes("blocking disagreement")), true);
});

await check("retains a disagreement the lens did not mark blocking", () => {
  const summary = reviewSummary(pkg({ required_lenses: ["qa"] }), [
    ret("qa", { disagreements: [{ with: "tester", claim: "style", blocking: false }] }),
  ]);
  assert.deepEqual(summary.lens_results[0].returns[0].disagreements, [{ with: "tester", claim: "style", blocking: false }]);
});

await check("reports a pass carrying blockers as evidence", () => {
  const summary = reviewSummary(pkg(), [ret("qa", { findings: [{ file: "src/a.js" }] })]);
  assert.equal(summary.unknown_coverage.length, 1);
  assert.equal(Object.hasOwn(summary, "ready"), false);
});

await check("demotes a finding outside a delta range to a concern", () => {
  const delta = pkg({ scope: { kind: "delta", prior_anchor: "abcdef1", paths: ["src/a.js"] } });
  const split = partitionFindings(delta, [{ file: "src/unrelated.js" }, { file: "src/a.js" }]);
  assert.equal(split.concerns.length, 1);
  assert.equal(split.blockers.length, 1);
  const summary = reviewSummary(delta, [{ ...ret("qa"), findings: [{ file: "src/unrelated.js" }] }]);
  assert.equal(summary.concerns.length, 1);
});

await check("classifies blocker and high severities as blocking evidence", () => {
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

await check("normalizes contract locations when partitioning findings", () => {
  assert.deepEqual(findingFiles({ locations: ["src/a.js:10", "src/a.js:12"] }), ["src/a.js"]);
  assert.deepEqual(findingFiles({ locations: ["src/a.js:10:4", "src/part:name.js:12"] }), ["src/a.js", "src/part:name.js"]);
  assert.deepEqual(findingFiles({ file: "src/b.js:7" }), ["src/b.js"]);
  assert.deepEqual(findingFiles({ files: ["src/c.js:3", "src/c.js"] }), ["src/c.js"]);
  assert.deepEqual(findingFiles({ path: "src/d.js", line: 9 }), ["src/d.js"]);
  assert.deepEqual(findingFiles({ evidence: [{ path: "src/e.js", line: 11, detail: "assertion" }] }), ["src/e.js"]);
  const delta = pkg({ scope: { kind: "delta", prior_anchor: "abc", paths: ["src/a.js"], range_paths: ["src/a.js"] } });
  const split = partitionFindings(delta, [{ severity: "high", locations: ["src/a.js:10"] }]);
  assert.equal(split.blockers.length, 1, "an in-scope location was treated as outside the delta");
  assert.equal(split.concerns.length, 0);
  const topLevel = partitionFindings(delta, [{ severity: "high", path: "src/a.js", line: 10 }]);
  assert.equal(topLevel.blockers.length, 1, "a path+line location was treated as outside the delta");
  const evidence = partitionFindings(delta, [{ severity: "high", evidence: [{ path: "src/a.js", line: 10 }] }]);
  assert.equal(evidence.blockers.length, 1, "an evidence location was treated as outside the delta");
  const freeEvidence = { severity: "high", evidence: ["assertion text without a source location"] };
  assert.deepEqual(findingFiles(freeEvidence), [], "free evidence text was interpreted as a repository path");
  assert.equal(partitionFindings(delta, [freeEvidence]).blockers.length, 1, "free evidence was demoted as an out-of-scope path");
});

await check("keeps malformed delta locations blocking instead of treating them as out of scope", () => {
  const delta = pkg({ scope: { kind: "delta", prior_anchor: "abc", paths: ["src/a.js"], range_paths: ["src/a.js"] } });
  const malformedTopLevel = { severity: "high", path: "src/a.js", line: 0 };
  assert.equal(findingLocationIssues(malformedTopLevel).length, 1, "an invalid path+line was silently normalized");
  assert.equal(partitionFindings(delta, [malformedTopLevel]).blockers.length, 1, "an invalid path+line was demoted");
  for (const location of ["C:/other/repo/changed.ts:1", "../changed.ts:1", "/tmp/changed.ts:1", "..\\changed.ts:1"]) {
    const finding = { severity: "high", locations: [location] };
    assert.equal(findingLocationIssues(finding).length, 1, location);
    const split = partitionFindings(delta, [finding]);
    assert.equal(split.blockers.length, 1, location);
    assert.equal(split.concerns.length, 0, location);
  }
  const summary = reviewSummary(delta, [{ ...ret("qa"), findings: [{ severity: "high", locations: ["C:/other/repo/changed.ts:1"] }] }]);
  assert.equal(summary.unknown_coverage.length, 1, "a malformed high-severity location must remain visible");
  assert.ok(summary.observations.some((observation) => observation.includes("blocker(s)")));
  const legitimateOutside = partitionFindings(delta, [{ severity: "high", locations: ["src/unrelated.js:1"] }]);
  assert.equal(legitimateOutside.concerns.length, 1, "a valid repository-relative out-of-scope finding remains a concern");
});

await check("keeps absent or unrecognized severity at the blocking floor", () => {
  for (const entry of [{ file: "src/a.js" }, { file: "src/a.js", severity: "urgent" }, { file: "src/a.js", severity: 7 }]) {
    assert.equal(partitionFindings(pkg(), [entry]).blockers.length, 1, JSON.stringify(entry));
    assert.equal(belowFloor(entry), false);
  }
});

await check("routes a sub-floor unknown finding to concerns", () => {
  const anticipated = pkg({ criteria: [{ text: "Some property", provenance: "written-intent" }] });
  const summary = reviewSummary(anticipated, [ret("qa", { findings: [{ file: "src/a.js", severity: "low", criterion: "Unrelated" }] })]);
  assert.equal(summary.concerns.length, 1);
  assert.equal(summary.unknown_coverage.length, 0);
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
  const summary = reviewSummary(ambiguous, [ret("qa", { verdict: "fail", findings: [{ file: "src/a.js", criterion: "Only a successful benign classification" }] })]);
  assert.equal(summary.covered.length, 0, "an ambiguous match was bound to one arbitrary criterion");
  assert.equal(summary.unknown_coverage.length, 1);
  assert.equal(summary.unknown_coverage[0].coverage, "unknown");
});

await check("binds an exact criterion match even when another criterion contains it", () => {
  const overlapping = pkg({ criteria: [
    { text: "Validation runs once", provenance: "written-intent" },
    { text: "Validation runs once and a fix closes by executing its oracle", provenance: "written-intent" },
  ] });
  const summary = reviewSummary(overlapping, [ret("qa", { verdict: "fail", findings: [{ file: "src/a.js", criterion: "Validation runs once" }] })]);
  assert.equal(summary.covered.length, 1);
  assert.equal(summary.covered[0].criterion, "Validation runs once");
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

await check("keeps the legacy gate invocation as a non-blocking summary alias", async () => withRepository(async (root) => {
  const packagePath = path.join(root, "package.json5");
  await writeFile(packagePath, JSON.stringify(pkg()));
  const returnsPath = path.join(root, "returns.json");
  await writeFile(returnsPath, JSON.stringify([ret("qa", { verdict: "fail", findings: [{ severity: "high", path: "src/a.js", line: 4 }] })]));
  const gate = await runReviewFan({ subcommand: "gate", package: packagePath, returns: returnsPath });
  const summary = await runReviewFan({ subcommand: "summary", package: packagePath, returns: returnsPath });
  assert.equal(gate.verdict, "pass", "an advisory finding turned the helper into a process failure");
  assert.equal(gate.kind, "team_harness_inline_review_summary");
  assert.deepEqual(gate.summary, summary.summary);
  assert.equal(gate.summary.lens_results[0].outcome.verdict, "fail");
  assert.equal(Object.hasOwn(gate, "decision"), false);
  assert.equal(Object.hasOwn(gate.summary, "ready"), false);
  assert.deepEqual(gateDecision(pkg(), [ret("qa")]), reviewSummary(pkg(), [ret("qa")]));

  const script = path.resolve("skills/verify/scripts/review-fan.mjs");
  const child = await run(process.execPath, [script, "gate", "--package", packagePath, "--returns", returnsPath], { windowsHide: true });
  const cli = JSON.parse(child.stdout);
  assert.equal(cli.verdict, "pass", "the gate compatibility CLI failed on advisory conclusions");
  assert.equal(cli.kind, "team_harness_inline_review_summary");
}));

await check("summarizes a checker-only package without inventing a lens", async () => withRepository(async (root) => {
  const packagePath = path.join(root, "package.json5");
  await writeFile(packagePath, JSON.stringify(pkg({
    required_lenses: [], requested_lenses: [], recommended_lenses: [], fully_verified: true,
  })));
  const returnsPath = path.join(root, "returns.json");
  await writeFile(returnsPath, JSON.stringify([]));
  const result = await runReviewFan({ subcommand: "summary", package: packagePath, returns: returnsPath });
  assert.equal(result.verdict, "pass");
  assert.deepEqual(result.summary.lens_results, []);
  assert.deepEqual(result.summary.missing, []);
  assert.deepEqual(result.summary.unrequested, []);
}));

await check("rejects malformed summary scope paths as a package error", async () => withRepository(async (root) => {
  const returnsPath = path.join(root, "returns.json");
  await writeFile(returnsPath, JSON.stringify([]));
  for (const [index, scope] of [
    { kind: "full", paths: "src/a.js" },
    { kind: "delta", paths: ["src/a.js"], range_paths: "src/a.js" },
    { kind: "full", range_paths: ["src/a.js"] },
  ].entries()) {
    const packagePath = path.join(root, `malformed-package-${index}.json5`);
    await writeFile(packagePath, JSON.stringify(pkg({ scope })));
    const result = await runReviewFan({ subcommand: "summary", package: packagePath, returns: returnsPath });
    assert.equal(result.error_code, "PACKAGE_INVALID", JSON.stringify(scope));
  }
}));

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

await check("malformed disagreements identify the invalid returns", async () => withRepository(async (root) => {
  const packagePath = path.join(root, "package.json5");
  const returnsPath = path.join(root, "returns.json");
  await writeFile(packagePath, JSON.stringify(pkg()));
  for (const disagreements of ["invalid", {}, [null], ["invalid"], [{ blocking: "yes" }]]) {
    await writeFile(returnsPath, JSON.stringify([ret("qa", { disagreements })]));
    const result = await runReviewFan({ subcommand: "summary", package: packagePath, returns: returnsPath });
    assert.equal(result.error_code, "RETURNS_INVALID", JSON.stringify(disagreements));
  }
}));

if (failures.length > 0) {
  console.error(`${failures.length} review fan checks failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
