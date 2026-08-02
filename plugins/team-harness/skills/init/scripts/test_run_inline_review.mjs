#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { buildManifestDigest, buildTargetId, canonicalJson, consolidateInlineReviews, parseLensResult, runInlineReview } from "./run_inline_review.mjs";

const FAKE = `#!/usr/bin/env python3
import json, os, sys
pkg = json.load(sys.stdin)
record = {"argv": sys.argv[1:], "cwd": os.getcwd(), "cwd_entries": os.listdir(), "env": dict(os.environ), "input": pkg}
with open(os.path.join(os.environ["CODEX_HOME"], "record.json"), "w", encoding="utf-8") as stream:
    json.dump(record, stream)
ref = {"evidence_id": "E-001", "digest": pkg["evidence_manifest"][0]["digest"]}
result = {"lens": pkg["lens"], "lens_status": "complete", "target_id": pkg["target_id"], "manifest_digest": pkg["manifest_digest"], "verdict": "pass", "output": None, "evidence_refs": [ref], "findings": [], "coverage": {"checked": [{"claim": "package supplied", "evidence": [ref]}], "limits": []}, "disagreements": []}
print(json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(result)}}))
`;

async function packageFor(sourcePath, lens = "qa") {
  const canonicalSource = await realpath(sourcePath);
  const content = await readFile(canonicalSource, "utf8");
  const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  const evidence_manifest = [{ evidence_id: "E-001", realpath: canonicalSource, digest, kind: "source", encoding: "utf-8", byte_length: Buffer.byteLength(content), content }];
  const reviewPackage = {
    mode: "inline-review",
    allowed_roots: [await realpath(dirname(canonicalSource))],
    coordinates: { repository: "example/repo", ref: "abc123", source: "live" },
    target: { kind: "workspace", id: "example" },
    scope: { paths: ["src"], symbols: [], constraints: [] },
    intent: { text: "review supplied evidence", provenance: "live-operator" },
    criteria: [{ text: "no regression", provenance: "live-operator" }],
    changed_surface: [{ path: "src/index.js", change: "modified" }],
    requested_lenses: [lens],
    required_lenses: [lens],
    lens,
    read_only: true,
    evidence_manifest,
  };
  reviewPackage.manifest_digest = buildManifestDigest(evidence_manifest);
  reviewPackage.target_id = buildTargetId(reviewPackage);
  return reviewPackage;
}

async function fakeFixture() {
  const root = await mkdtemp(join(tmpdir(), "team-harness-inline-test-"));
  const fake = join(root, "fake-codex.mjs");
  await writeFile(fake, FAKE);
  await chmod(fake, 0o755);
  const codexHome = join(root, "auth-home");
  await mkdir(codexHome);
  return { root, fake, codexHome };
}

async function writeFake(fixture, name, source) {
  const path = join(fixture.root, name);
  await writeFile(path, source, "utf8");
  await chmod(path, 0o755);
  return path;
}

function rebindPackage(pkg, realpath, content, allowedRoots = pkg.allowed_roots) {
  const changed = structuredClone(pkg);
  const bytes = Buffer.from(content, "utf8");
  changed.allowed_roots = allowedRoots;
  changed.evidence_manifest[0] = { ...changed.evidence_manifest[0], realpath, content, byte_length: bytes.length, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
  changed.manifest_digest = buildManifestDigest(changed.evidence_manifest);
  changed.target_id = buildTargetId(changed);
  return changed;
}

async function expectKind(action, kind) {
  await assert.rejects(action, error => error.kind === kind, `expected ${kind}`);
}

function checkTargetMutations(pkg) {
  const mutations = [
    ["mode", p => { p.mode = "other"; }], ["allowed roots", p => { p.allowed_roots = ["/other/root"]; }], ["target", p => { p.target.id = "other"; }],
    ["coordinates", p => { p.coordinates.ref = "other"; }], ["scope", p => { p.scope.paths = ["other"]; }],
    ["intent", p => { p.intent.text = "other"; }], ["intent provenance", p => { p.intent.provenance = "trusted-policy"; }],
    ["criteria", p => { p.criteria[0].text = "other"; }], ["criteria provenance", p => { p.criteria[0].provenance = "trusted-policy"; }],
    ["changed surface", p => { p.changed_surface[0].change = "added"; }],
    ["requested lenses", p => { p.requested_lenses = ["qa", "tester"]; }],
    ["required lenses", p => { p.required_lenses = ["qa", "tester"]; }], ["current lens", p => { p.lens = "tester"; }],
    ["read_only", p => { p.read_only = false; }], ["manifest", p => { p.evidence_manifest[0].kind = "diff"; }], ["captured content", p => { p.evidence_manifest[0].content = "changed"; }],
    ["manifest digest", p => { p.manifest_digest = `sha256:${"b".repeat(64)}`; }],
  ];
  for (const [label, mutate] of mutations) {
    const changed = structuredClone(pkg);
    mutate(changed);
    assert.notEqual(buildTargetId(pkg), buildTargetId(changed), `${label} mutation must change target_id`);
  }
  const alteredManifest = [{ ...pkg.evidence_manifest[0], digest: `sha256:${"b".repeat(64)}` }];
  assert.notEqual(buildManifestDigest(pkg.evidence_manifest), buildManifestDigest(alteredManifest), "manifest mutation must change digest");
}

async function runSuccessfulReview(pkg) {
  const fixture = await fakeFixture();
  try {
    const result = await runInlineReview({ reviewPackage: pkg, codexCommand: fixture.fake, env: { PATH: process.env.PATH, CODEX_HOME: fixture.codexHome, SECRET_TOKEN: "must-not-leak" } });
    assert.equal(result.lens_status, "complete");
    const record = JSON.parse(await readFile(join(fixture.codexHome, "record.json"), "utf8"));
    for (const marker of ["--ephemeral", "--ignore-user-config", "--ignore-rules", "--strict-config", "--json", "--skip-git-repo-check", "features.shell_tool=false", "features.apps=false", "features.multi_agent=false", "web_search=\"disabled\"", "mcp_servers={}"]) {
      assert.ok(record.argv.includes(marker), `missing child guard ${marker}`);
    }
    const filesystemOverride = 'permissions.inline-review.filesystem={":root"="deny",":minimal"="read",":tmpdir"="deny",":slash_tmp"="deny"}';
    assert.ok(record.argv.includes(filesystemOverride), "strict-config filesystem override must be one inline table");
    for (const malformed of [
      'permissions.inline-review.filesystem.\":root\"="deny"',
      'permissions.inline-review.filesystem.\":minimal\"="read"',
      'permissions.inline-review.filesystem.\":tmpdir\"="deny"',
      'permissions.inline-review.filesystem.\":slash_tmp\"="deny"',
    ]) assert.equal(record.argv.includes(malformed), false, `malformed per-key override must be absent: ${malformed}`);
    assert.ok(record.argv.includes("gpt-5.6-luna") && record.argv.some(value => value.includes("model_reasoning_effort") && value.includes("max")), "model and effort must be explicit");
    assert.equal(record.input.target_id, pkg.target_id, "package must arrive on stdin");
    assert.equal(record.input.evidence_manifest[0].content, pkg.evidence_manifest[0].content, "child must receive captured source bytes");
    assert.equal(record.input.evidence_manifest[0].digest, pkg.evidence_manifest[0].digest, "child must receive content digest");
    assert.ok(record.argv.every(value => !value.includes(pkg.target_id) && !value.includes("example/repo")), "package JSON must not appear in argv");
    assert.deepEqual(record.cwd_entries, [], "child cwd must start empty");
    assert.equal(record.env.SECRET_TOKEN, undefined, "child environment must be sanitized");
    await assert.rejects(access(record.cwd), "temporary cwd must be removed");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}

async function runRejectedReviews(pkg) {
  const traversal = structuredClone(pkg);
  traversal.evidence_manifest[0].realpath = "/captured/../escaped.json";
  traversal.manifest_digest = buildManifestDigest(traversal.evidence_manifest);
  traversal.target_id = buildTargetId(traversal);
  await expectKind(() => runInlineReview({ reviewPackage: traversal, codexCommand: "/bin/false", env: {} }), "untrusted");
  const wrongRequired = structuredClone(pkg);
  wrongRequired.requested_lenses = ["tester"];
  wrongRequired.required_lenses = ["tester"];
  await expectKind(() => runInlineReview({ reviewPackage: wrongRequired, codexCommand: "/bin/false", env: {} }), "untrusted");
  const duplicateLenses = structuredClone(pkg);
  duplicateLenses.requested_lenses = ["qa", "qa"];
  await expectKind(() => runInlineReview({ reviewPackage: duplicateLenses, codexCommand: "/bin/false", env: {} }), "untrusted");
  let fixture = await fakeFixture();
  try {
    const toolFake = join(fixture.root, "tool-codex");
    await writeFile(toolFake, FAKE.replace("print(json.dumps({\"type\": \"item.completed\", \"item\": {\"type\": \"agent_message\", \"text\": json.dumps(result)}}))", "print(json.dumps({\"type\": \"command_execution\"}))"));
    await chmod(toolFake, 0o755);
    await expectKind(() => runInlineReview({ reviewPackage: pkg, codexCommand: toolFake, env: { CODEX_HOME: fixture.codexHome } }), "untrusted");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
  await expectKind(() => runInlineReview({ reviewPackage: pkg, codexCommand: "/no/such/codex", env: {} }), "unavailable");
  fixture = await fakeFixture();
  try {
    const malformed = join(fixture.root, "malformed-codex");
    await writeFile(malformed, FAKE.replace("print(json.dumps({\"type\": \"item.completed\", \"item\": {\"type\": \"agent_message\", \"text\": json.dumps(result)}}))", "print('{not-json}')"));
    await chmod(malformed, 0o755);
    await expectKind(() => runInlineReview({ reviewPackage: pkg, codexCommand: malformed, env: { CODEX_HOME: fixture.codexHome } }), "untrusted");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}

async function runSourceFailures(pkg, source) {
  const original = pkg.evidence_manifest[0].content;
  const contentMismatch = structuredClone(pkg);
  contentMismatch.evidence_manifest[0].content = "tampered bytes\n";
  await expectKind(() => runInlineReview({ reviewPackage: contentMismatch, codexCommand: "/bin/false", env: {} }), "untrusted");
  const hashMismatch = structuredClone(pkg);
  hashMismatch.evidence_manifest[0].digest = `sha256:${"b".repeat(64)}`;
  hashMismatch.manifest_digest = buildManifestDigest(hashMismatch.evidence_manifest);
  hashMismatch.target_id = buildTargetId(hashMismatch);
  await expectKind(() => runInlineReview({ reviewPackage: hashMismatch, codexCommand: "/bin/false", env: {} }), "untrusted");
  const outsideRoot = await mkdtemp(join(tmpdir(), "team-harness-inline-outside-"));
  const outside = join(outsideRoot, "outside.txt");
  await writeFile(outside, original, "utf8");
  const outsidePackage = rebindPackage(pkg, await realpath(outside), original);
  await expectKind(() => runInlineReview({ reviewPackage: outsidePackage, codexCommand: "/bin/false", env: {} }), "untrusted");
  const link = join(pkg.allowed_roots[0], "evidence-link.txt");
  await symlink(outside, link);
  await expectKind(() => runInlineReview({ reviewPackage: rebindPackage(pkg, link, original), codexCommand: "/bin/false", env: {} }), "untrusted");
  await rm(link, { force: true });
  await rm(source, { force: true });
  await expectKind(() => runInlineReview({ reviewPackage: pkg, codexCommand: "/bin/false", env: {} }), "unavailable");
  assert.equal(consolidateInlineReviews(pkg, [validResult(pkg)]).global_verdict, "not-pass", "consolidation must re-verify missing source");
  await writeFile(source, original, "utf8");
  await writeFile(source, "changed after dispatch\n", "utf8");
  assert.equal(consolidateInlineReviews(pkg, [validResult(pkg)]).global_verdict, "not-pass", "consolidation must re-verify changed source");
  await writeFile(source, original, "utf8");
  await rm(outsideRoot, { recursive: true, force: true });
}

async function runLifecycleReviews(pkg) {
  const fixture = await fakeFixture();
  try {
    const hang = await writeFake(fixture, "hang-codex", `#!/usr/bin/env python3\nimport os, time\nopen(os.path.join(os.environ["CODEX_HOME"], "cwd.txt"), "w").write(os.getcwd())\ntime.sleep(30)\n`);
    await expectKind(() => runInlineReview({ reviewPackage: pkg, codexCommand: hang, env: { CODEX_HOME: fixture.codexHome }, timeoutMs: 100, graceMs: 50 }), "unavailable");
    const cwd = (await readFile(join(fixture.codexHome, "cwd.txt"), "utf8")).trim();
    await assert.rejects(access(cwd), "timed-out child cwd must be removed");
    const flood = await writeFake(fixture, "stdout-flood", "#!/usr/bin/env python3\nprint('x' * 600000)\n");
    await expectKind(() => runInlineReview({ reviewPackage: pkg, codexCommand: flood, env: { CODEX_HOME: fixture.codexHome }, stdoutBytes: 1024 }), "untrusted");
    const stderrFlood = await writeFake(fixture, "stderr-flood", "#!/usr/bin/env python3\nimport sys\nsys.stderr.write('x' * 2048)\nsys.stderr.flush()\n");
    await expectKind(() => runInlineReview({ reviewPackage: pkg, codexCommand: stderrFlood, env: { CODEX_HOME: fixture.codexHome }, stderrBytes: 1024 }), "untrusted");
    const nonzero = await writeFake(fixture, "nonzero", "#!/usr/bin/env python3\nimport sys\nsys.stderr.write('profile unavailable')\nsys.exit(3)\n");
    await expectKind(() => runInlineReview({ reviewPackage: pkg, codexCommand: nonzero, env: { CODEX_HOME: fixture.codexHome } }), "unavailable");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
  await expectKind(() => runInlineReview({ reviewPackage: pkg, model: "evil-model", env: {} }), "unavailable");
}

async function runIdentityFailures(pkg) {
  const fixture = await fakeFixture();
  try {
    for (const [field, value] of [["target_id", "sha256:bad"], ["manifest_digest", "sha256:bad"]]) {
      const bad = join(fixture.root, `bad-${field}`);
      const replacement = `result["${field}"] = "${value}"; print(json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(result)}}))`;
      await writeFile(bad, FAKE.replace("print(json.dumps({\"type\": \"item.completed\", \"item\": {\"type\": \"agent_message\", \"text\": json.dumps(result)}}))", replacement));
      await chmod(bad, 0o755);
      await expectKind(() => runInlineReview({ reviewPackage: pkg, codexCommand: bad, env: { CODEX_HOME: fixture.codexHome } }), "untrusted");
    }
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}

function validResult(pkg) {
  const evidence = { evidence_id: "E-001", digest: pkg.evidence_manifest[0].digest };
  return { lens: pkg.lens, lens_status: "complete", target_id: pkg.target_id, manifest_digest: pkg.manifest_digest, verdict: "pass", output: null, evidence_refs: [evidence], findings: [], coverage: { checked: [{ claim: "package supplied", evidence: [evidence] }], limits: [] }, disagreements: [] };
}

function packageForLens(pkg, lens) {
  const derived = { ...pkg, lens };
  derived.target_id = buildTargetId(derived);
  return derived;
}

function validResultForLens(pkg, lens) {
  return validResult(packageForLens(pkg, lens));
}

function multiLensPackage(pkg) {
  const multi = structuredClone(pkg);
  multi.requested_lenses = ["tester", "qa", "security"];
  multi.required_lenses = ["tester", "qa", "security"];
  multi.lens = "qa";
  multi.target_id = buildTargetId(multi);
  return multi;
}

function checkResultBindings(pkg) {
  const valid = validResult(pkg);
  assert.deepEqual(parseLensResult(JSON.stringify(valid), pkg, pkg.lens), valid, "valid claim-bound response must parse");
  assert.equal(consolidateInlineReviews(pkg, [valid]).global_verdict, "pass", "valid claim-bound response must consolidate");
  const vacuous = structuredClone(valid);
  vacuous.coverage.checked = [];
  assert.throws(() => parseLensResult(JSON.stringify(vacuous), pkg, pkg.lens), /complete pass requires/, "vacuous complete pass must be rejected by parser");
  assert.equal(consolidateInlineReviews(pkg, [vacuous]).global_verdict, "not-pass", "vacuous complete pass must be rejected by consolidation");
  const cases = [
    ["finding", result => { result.findings = [{ severity: "high", claim: "unbound", evidence: [] }]; }],
    ["coverage", result => { result.coverage.checked = [{ claim: "unbound", evidence: [] }]; }],
    ["disagreement", result => { result.disagreements = [{ with: "tester", claim: "unbound", evidence: [], blocking: false, severity: "info" }]; }],
  ];
  for (const [label, mutate] of cases) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.throws(() => parseLensResult(JSON.stringify(invalid), pkg, pkg.lens), /must bind a non-empty claim to evidence/, `${label} must be rejected by parser`);
    assert.equal(consolidateInlineReviews(pkg, [invalid]).global_verdict, "not-pass", `${label} must be rejected by consolidation`);
  }
}

function checkExactSchemas(pkg) {
  assert.throws(() => canonicalJson({ value: 2 ** 53 }), /canonical JSON/);
  assert.throws(() => canonicalJson({ value: 1.5 }), /canonical JSON/);
  for (const value of [undefined, () => {}, Symbol("x"), 1n, Infinity]) assert.throws(() => canonicalJson({ value }), /canonical JSON/);
  assert.throws(() => canonicalJson(JSON.parse('{"__proto__":1}')), /canonical JSON/);
  assert.throws(() => buildTargetId({ ...pkg, scope: { value: 2 ** 53 } }), /canonical JSON/);
  const valid = validResult(pkg);
  const unknown = structuredClone(valid);
  unknown.status = "complete";
  assert.throws(() => parseLensResult(JSON.stringify(unknown), pkg, pkg.lens), /unexpected or missing keys/);
  const duplicateRoots = structuredClone(pkg);
  duplicateRoots.allowed_roots = [...pkg.allowed_roots, pkg.allowed_roots[0]];
  duplicateRoots.target_id = buildTargetId(duplicateRoots);
  assert.throws(() => parseLensResult(JSON.stringify(valid), duplicateRoots, pkg.lens), /allowed_roots/);
  assert.equal(consolidateInlineReviews(pkg, [valid, valid]).global_verdict, "not-pass", "duplicate results must not overwrite");
  assert.equal(consolidateInlineReviews(pkg, []).global_verdict, "not-pass", "missing results must not pass");
  const extra = structuredClone(valid);
  extra.lens = "tester";
  assert.equal(consolidateInlineReviews(pkg, [extra]).global_verdict, "not-pass", "extra result lens must not pass");
  const blocking = structuredClone(valid);
  const evidence = blocking.coverage.checked[0].evidence[0];
  blocking.disagreements = [{ with: "tester", claim: "blocking", evidence: [evidence], blocking: true, severity: "high" }];
  assert.equal(consolidateInlineReviews(pkg, [blocking]).global_verdict, "not-pass", "raw blocking disagreement must block");
  assert.equal(consolidateInlineReviews(pkg, [blocking]).unresolved_blocking_disagreement, true);
  const resolved = structuredClone(blocking);
  resolved.disagreements[0].resolved = true;
  assert.throws(() => parseLensResult(JSON.stringify(resolved), pkg, pkg.lens), /unexpected or missing keys/);
  const selfDisagreement = structuredClone(valid);
  selfDisagreement.disagreements = [{ with: pkg.lens, claim: "self", evidence: [evidence], blocking: false, severity: "info" }];
  assert.throws(() => parseLensResult(JSON.stringify(selfDisagreement), pkg, pkg.lens), /metadata is invalid/);
}

function checkMultiLensConsolidation(pkg) {
  const multi = multiLensPackage(pkg);
  const results = multi.required_lenses.map(lens => validResultForLens(multi, lens));
  assert.equal(new Set(results.map(result => result.target_id)).size, 3, "each lens must derive a distinct target identity");
  assert.equal(consolidateInlineReviews(multi, results).global_verdict, "pass", "all correctly bound lenses must consolidate");
  assert.equal(consolidateInlineReviews(multi, results.slice(0, 2)).global_verdict, "not-pass", "missing lens result must not pass");
  assert.equal(consolidateInlineReviews(multi, [results[0], results[1], results[1]]).global_verdict, "not-pass", "duplicate lens result must not pass");
  const wrongIdentity = structuredClone(results[2]);
  wrongIdentity.target_id = results[0].target_id;
  assert.equal(consolidateInlineReviews(multi, [results[0], results[1], wrongIdentity]).global_verdict, "not-pass", "wrong lens identity must not pass");
}

function checkConsolidation(pkg) {
  const completeFail = { ...validResult(pkg), verdict: "fail" };
  const completeConcerns = { ...completeFail, verdict: "concerns" };
  assert.equal(consolidateInlineReviews(pkg, [completeFail]).global_verdict, "not-pass");
  assert.equal(consolidateInlineReviews(pkg, [completeConcerns]).global_verdict, "not-pass");
  const missingOutput = { ...completeFail, verdict: "pass" };
  delete missingOutput.output;
  assert.equal(consolidateInlineReviews(pkg, [missingOutput]).global_verdict, "not-pass", "missing output must not pass");
  const disagreement = { ...completeFail, verdict: "pass", disagreements: [{ with: "tester", claim: "bad digest", evidence: [{ evidence_id: "E-001", digest: "sha256:bad" }], blocking: false, severity: "info" }] };
  assert.equal(consolidateInlineReviews(pkg, [disagreement]).global_verdict, "not-pass", "untrusted disagreement evidence must not pass");
}

async function evidenceFixture() {
  const root = await mkdtemp(join(tmpdir(), "team-harness-inline-evidence-"));
  const source = join(root, "evidence.txt");
  await writeFile(source, "captured source bytes\n", "utf8");
  return { root, source };
}

async function main() {
  const evidence = await evidenceFixture();
  try {
    const pkg = await packageFor(evidence.source);
    checkTargetMutations(pkg);
    await runSuccessfulReview(pkg);
    await runRejectedReviews(pkg);
    await runSourceFailures(pkg, evidence.source);
    await runLifecycleReviews(pkg);
    await runIdentityFailures(pkg);
    checkResultBindings(pkg);
    checkExactSchemas(pkg);
    checkConsolidation(pkg);
    checkMultiLensConsolidation(pkg);
    console.log("inline review runner: PASS");
  } finally { await rm(evidence.root, { recursive: true, force: true }); }
}

main().catch(error => {
  console.error(`inline review runner: FAIL: ${error.message}`);
  process.exitCode = 1;
});
