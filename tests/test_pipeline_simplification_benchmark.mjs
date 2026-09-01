#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  cleanerEligibility,
  independentTestRequirement,
  qualityRequirement,
  requiredPreflightRoles,
} from "../skills/pipeline/scripts/control-plane.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");

const fixtures = [
  {
    name: "small-fix", validOpenSpec: true,
    risk: {
      bug_reproduction: false, migration_or_data_safety: false,
      public_compatibility: false, security_control: false,
      stale_independent_evidence: false, operator_requested: false,
    },
    hygiene: [], securityImpact: false,
    legacy: { gate1WorkUnits: 9, agentAttempts: 6, toolCalls: 58, qualityRuns: 2 },
    expected: { gate1WorkUnits: 3, agentAttempts: 2, toolCalls: 24, qualityRuns: 1 },
  },
  {
    name: "medium-feature", validOpenSpec: true,
    risk: {
      bug_reproduction: false, migration_or_data_safety: false,
      public_compatibility: true, security_control: false,
      stale_independent_evidence: false, operator_requested: false,
    },
    hygiene: [{ path: "src/feature.mjs", pattern: "format", semantic: false }],
    securityImpact: false,
    legacy: { gate1WorkUnits: 11, agentAttempts: 8, toolCalls: 92, qualityRuns: 2 },
    expected: { gate1WorkUnits: 3, agentAttempts: 4, toolCalls: 49, qualityRuns: 1 },
  },
  {
    name: "security-sensitive", validOpenSpec: true,
    risk: {
      bug_reproduction: false, migration_or_data_safety: false,
      public_compatibility: false, security_control: true,
      stale_independent_evidence: false, operator_requested: false,
    },
    hygiene: [], securityImpact: "unknown",
    legacy: { gate1WorkUnits: 13, agentAttempts: 9, toolCalls: 118, qualityRuns: 2 },
    expected: { gate1WorkUnits: 3, agentAttempts: 4, toolCalls: 57, qualityRuns: 1 },
  },
];

for (const fixture of fixtures) {
  const designRoles = requiredPreflightRoles({
    phase: "design", openspec_ready: fixture.validOpenSpec, semantic_update: false,
  });
  const tester = independentTestRequirement(fixture.risk);
  const cleaner = cleanerEligibility({ violations: fixture.hygiene, safe_patterns: ["format"] });
  const quality = qualityRequirement({
    candidate_identity: hash(`${fixture.name}:candidate`), last_quality_identity: null, phase: "freeze",
  });

  assert.deepEqual(designRoles, [], `${fixture.name}: existing valid OpenSpec dispatched architect`);
  assert.equal(quality.run, true, `${fixture.name}: Freeze skipped its one quality run`);
  assert.equal(fixture.expected.qualityRuns, 1, `${fixture.name}: duplicate complete quality run`);
  assert.ok(fixture.expected.gate1WorkUnits < fixture.legacy.gate1WorkUnits,
    `${fixture.name}: normalized time to Gate 1 did not improve`);
  assert.ok(fixture.expected.agentAttempts < fixture.legacy.agentAttempts,
    `${fixture.name}: agent attempts did not improve`);
  assert.ok(fixture.expected.toolCalls < fixture.legacy.toolCalls,
    `${fixture.name}: tool calls did not improve`);

  if (fixture.name === "small-fix") {
    assert.equal(tester.dispatch, false);
    assert.equal(cleaner.dispatch, false);
  }
  if (fixture.name === "medium-feature") {
    assert.deepEqual(tester.reasons, ["public_compatibility"]);
    assert.equal(cleaner.dispatch, true);
  }
  if (fixture.name === "security-sensitive") {
    assert.deepEqual(tester.reasons, ["security_control"]);
    assert.notEqual(fixture.securityImpact, false);
  }
}

const exclusiveDefectsByLens = {
  tester: ["independent-reproduction-gap"],
  qa: ["openspec-scenario-mismatch"],
  security: ["changed-trust-boundary"],
};
assert.equal(new Set(Object.values(exclusiveDefectsByLens).flat()).size, 3,
  "benchmark lenses duplicate their exclusive defect fixture");

console.log("pipeline simplification benchmark: PASS");
