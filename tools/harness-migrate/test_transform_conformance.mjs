#!/usr/bin/env node
// tools/harness-migrate/test_transform_conformance.mjs
// Node-side cross-language drift conformance runner.
//
// Loads cmd/install/testdata/transform-conformance.json and asserts that
// migrate.mjs's forward transform (transformToOpencode) produces the expected
// logical output for each case — the JS half of the cross-language drift contract.
// The Go half is cmd/install/transform_test.go::TestTransformConformance_FixtureGo.
//
// Comparison strategy:
//   - Error cases: assert the transform throws (same as Go).
//   - Success cases: parse both the expected output and the actual output via
//     parseFrontmatter, then deep-compare the logical frontmatter objects and
//     body. This is deliberately format-agnostic: the Go serializer emits
//     flow-style permission objects while the JS serializer emits block style —
//     both represent the same logical data. The drift contract is about field
//     values, not serialization format.
//
// Run: node tools/harness-migrate/test_transform_conformance.mjs
// Exit 0 = all pass, 1 = any fail.
//
// A skip is NOT a pass — always logged loudly.

import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import {
  parseFrontmatter,
  transformToOpencode,
  transformToOpencodeTiered,
} from "./migrate.mjs";

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const scriptDir = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const fixtureFile = path.join(repoRoot, "cmd", "install", "testdata", "transform-conformance.json");

// ---------------------------------------------------------------------------
// Test harness (minimal, self-contained — no external test framework)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function pass(name) {
  console.log(`  [PASS] ${name}`);
  passed++;
}

function fail(name, detail) {
  const msg = detail ? `${name} — ${detail}` : name;
  console.log(`  [FAIL] ${msg}`);
  failed++;
  failures.push(msg);
}

// ---------------------------------------------------------------------------
// Deep-equality for frontmatter values (arrays, objects, scalars).
// Used to compare logical equivalence between Go-serialized and JS-serialized
// frontmatter without requiring byte-for-byte identical serialization.
//
// Normalization rule (serializer round-trip loss):
//   The JS serializer emits empty arrays as a bare "key:" line (no value),
//   and the parser re-reads that as "". The Go serializer emits "ask: []"
//   which the upgraded JS parser reads back as []. When comparing parsed
//   output from the JS transform against the parsed fixture expectedOutput,
//   we normalize "" === [] to avoid a false failure that is purely a
//   serialization artifact, not a logical transform difference.
// ---------------------------------------------------------------------------

function isEmptyCollection(v) {
  return v === "" || (Array.isArray(v) && v.length === 0);
}

function deepEqual(a, b) {
  // Normalization: empty string and empty array are logically equivalent
  // (serializer round-trip loss — see comment above).
  if (isEmptyCollection(a) && isEmptyCollection(b)) return true;

  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (typeof a === "object") {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (JSON.stringify(aKeys) !== JSON.stringify(bKeys)) return false;
    return aKeys.every((k) => deepEqual(a[k], b[k]));
  }

  // For scalars, do string comparison so that empty-string vs undefined-string
  // differences surface as failures.
  return String(a) === String(b);
}

function diffFrontmatter(want, got) {
  const lines = [];
  const allKeys = new Set([...Object.keys(want), ...Object.keys(got)]);
  for (const k of allKeys) {
    if (!deepEqual(want[k], got[k])) {
      lines.push(`  key '${k}': want=${JSON.stringify(want[k])} got=${JSON.stringify(got[k])}`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Transform wrapper: runs the forward transform with correct path classification.
// ---------------------------------------------------------------------------

function runForwardTransform(content, surface, tierProvider) {
  const fakeRepoRoot = "/conformance-fixture-repo";
  const fakePath = surface === "agent"
    ? path.join(fakeRepoRoot, "agents", "test.md")
    : path.join(fakeRepoRoot, ".claude", "commands", "test.md");

  try {
    const result = tierProvider
      ? transformToOpencodeTiered(fakePath, content, fakeRepoRoot, tierProvider)
      : transformToOpencode(fakePath, content, fakeRepoRoot);
    return { output: result.content };
  } catch (err) {
    return { error: err };
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

console.log("=== Node-side transform conformance (cross-language drift contract) ===");
console.log(`Fixture: ${fixtureFile}`);
console.log("");

let cases;
try {
  const raw = await fs.readFile(fixtureFile, "utf8");
  cases = JSON.parse(raw);
} catch (err) {
  console.error(`[FATAL] Cannot read fixture file: ${err.message}`);
  console.error(`        Expected at: ${fixtureFile}`);
  process.exit(1);
}

console.log(`Loaded ${cases.length} conformance case(s).`);
console.log("");

for (const tc of cases) {
  const { name, surface, input, expectedOutput, expectError, tierProvider } = tc;

  if (!name || !surface || input === undefined) {
    fail(name || "<unnamed>", "fixture case missing required fields (name, surface, input)");
    continue;
  }

  const { output, error } = runForwardTransform(input, surface, tierProvider);

  if (expectError) {
    // Error cases: assert the transform throws, matching Go behavior.
    if (error) {
      pass(`${name} [expectError]`);
    } else {
      fail(`${name} [expectError]`, `expected transform to throw but it succeeded; output:\n${output}`);
    }
    continue;
  }

  // Success cases: compare logical frontmatter content and body.
  if (error) {
    fail(name, `unexpected transform error: ${error.message}`);
    continue;
  }

  if (!expectedOutput) {
    fail(name, "fixture case missing expectedOutput for a non-error case");
    continue;
  }

  // Parse both outputs and compare logically.
  const { frontmatter: wantFm, body: wantBody } = parseFrontmatter(expectedOutput);
  const { frontmatter: gotFm, body: gotBody } = parseFrontmatter(output);

  const bodyOk = wantBody.trimEnd() === gotBody.trimEnd();
  const fmOk = deepEqual(wantFm, gotFm);

  if (fmOk && bodyOk) {
    pass(name);
  } else {
    const parts = [];
    if (!fmOk) {
      parts.push("frontmatter mismatch:\n" + diffFrontmatter(wantFm, gotFm));
    }
    if (!bodyOk) {
      parts.push(`body mismatch:\n  want: ${JSON.stringify(wantBody)}\n  got:  ${JSON.stringify(gotBody)}`);
    }
    fail(name, parts.join("\n"));
  }
}

console.log("");
console.log("============================================================");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailed cases:");
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
}
console.log("============================================================");

process.exit(failed > 0 ? 1 : 0);
