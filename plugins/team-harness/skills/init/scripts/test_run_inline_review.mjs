#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildManifestDigest, buildTargetId, consolidateInlineReviews, parseLensResult, runInlineReview } from "./run_inline_review.mjs";

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

function packageFor(lens = "qa") {
  const evidence_manifest = [{ evidence_id: "E-001", realpath: "/captured/evidence.json", digest: `sha256:${"a".repeat(64)}`, kind: "operator-input" }];
  const reviewPackage = {
    mode: "inline-review",
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

async function expectKind(action, kind) {
  await assert.rejects(action, error => error.kind === kind, `expected ${kind}`);
}

function checkTargetMutations(pkg) {
  const mutations = [
    ["mode", p => { p.mode = "other"; }], ["target", p => { p.target.id = "other"; }],
    ["coordinates", p => { p.coordinates.ref = "other"; }], ["scope", p => { p.scope.paths = ["other"]; }],
    ["intent", p => { p.intent.text = "other"; }], ["intent provenance", p => { p.intent.provenance = "trusted-policy"; }],
    ["criteria", p => { p.criteria[0].text = "other"; }], ["criteria provenance", p => { p.criteria[0].provenance = "trusted-policy"; }],
    ["changed surface", p => { p.changed_surface[0].change = "added"; }],
    ["requested lenses", p => { p.requested_lenses = ["qa", "tester"]; }],
    ["required lenses", p => { p.required_lenses = ["qa", "tester"]; }], ["current lens", p => { p.lens = "tester"; }],
    ["read_only", p => { p.read_only = false; }], ["manifest", p => { p.evidence_manifest[0].kind = "diff"; }],
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
    ["disagreement", result => { result.disagreements = [{ with: "tester", claim: "unbound", evidence: [] }]; }],
  ];
  for (const [label, mutate] of cases) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.throws(() => parseLensResult(JSON.stringify(invalid), pkg, pkg.lens), /must bind a non-empty claim to evidence/, `${label} must be rejected by parser`);
    assert.equal(consolidateInlineReviews(pkg, [invalid]).global_verdict, "not-pass", `${label} must be rejected by consolidation`);
  }
}

function checkConsolidation(pkg) {
  const completeFail = { ...validResult(pkg), verdict: "fail" };
  const completeConcerns = { ...completeFail, verdict: "concerns" };
  assert.equal(consolidateInlineReviews(pkg, [completeFail]).global_verdict, "not-pass");
  assert.equal(consolidateInlineReviews(pkg, [completeConcerns]).global_verdict, "not-pass");
  const missingOutput = { ...completeFail, verdict: "pass" };
  delete missingOutput.output;
  assert.equal(consolidateInlineReviews(pkg, [missingOutput]).global_verdict, "not-pass", "missing output must not pass");
  const disagreement = { ...completeFail, verdict: "pass", disagreements: [{ with: "tester", claim: "bad digest", evidence: [{ evidence_id: "E-001", digest: "sha256:bad" }] }] };
  assert.equal(consolidateInlineReviews(pkg, [disagreement]).global_verdict, "not-pass", "untrusted disagreement evidence must not pass");
}

async function main() {
  const pkg = packageFor();
  checkTargetMutations(pkg);
  await runSuccessfulReview(pkg);
  await runRejectedReviews(pkg);
  await runIdentityFailures(pkg);
  checkResultBindings(pkg);
  checkConsolidation(pkg);
  console.log("inline review runner: PASS");
}

main().catch(error => {
  console.error(`inline review runner: FAIL: ${error.message}`);
  process.exitCode = 1;
});
