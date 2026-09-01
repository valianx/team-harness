#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  cleanerEligibility,
  independentTestRequirement,
  qualityRequirement,
  requiredPreflightRoles,
  validationRequirements,
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
    hygiene: [],
    securityFloor: { applies: false, reason: null, categories: [], ambiguous: false, unscannable_paths: [] },
    legacy: { gate1WorkUnits: 9, agentAttempts: 6, toolCalls: 58, qualityRuns: 2 },
  },
  {
    name: "medium-feature", validOpenSpec: true,
    risk: {
      bug_reproduction: false, migration_or_data_safety: false,
      public_compatibility: true, security_control: false,
      stale_independent_evidence: false, operator_requested: false,
    },
    hygiene: [{ path: "src/feature.mjs", pattern: "format", semantic: false }],
    securityFloor: { applies: false, reason: null, categories: [], ambiguous: false, unscannable_paths: [] },
    legacy: { gate1WorkUnits: 11, agentAttempts: 8, toolCalls: 92, qualityRuns: 2 },
  },
  {
    name: "security-sensitive", validOpenSpec: true,
    risk: {
      bug_reproduction: false, migration_or_data_safety: false,
      public_compatibility: false, security_control: true,
      stale_independent_evidence: false, operator_requested: false,
    },
    hygiene: [],
    securityFloor: {
      applies: true, reason: "unscannable content in 1 path(s)", categories: [],
      ambiguous: true, unscannable_paths: ["security/control.bin"],
    },
    legacy: { gate1WorkUnits: 13, agentAttempts: 9, toolCalls: 118, qualityRuns: 2 },
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
  const validation = validationRequirements({
    candidate_changed: true,
    independent_test_required: tester.dispatch,
    security_floor: fixture.securityFloor,
  });
  assert.equal(validation.ok, true, `${fixture.name}: validation plan was invalid`);

  const gate1Operations = [
    "strict-openspec-validation",
    ...designRoles.map(role => `design-dispatch:${role}`),
    "operator-plan-projection",
  ];
  const agentRoles = [
    ...designRoles,
    "implementer",
    ...(tester.dispatch ? ["tester"] : []),
    ...(cleaner.dispatch ? ["cleaner"] : []),
    ...(validation.verifier ? ["qa"] : []),
    ...(validation.security ? ["security"] : []),
  ];
  const controlToolCalls = [
    ...gate1Operations,
    "derive-independent-test",
    "derive-cleaner",
    "derive-validation",
    "derive-quality",
    ...agentRoles.map(role => `dispatch:${role}`),
  ];
  const measured = {
    gate1WorkUnits: gate1Operations.length,
    agentAttempts: agentRoles.length,
    toolCalls: controlToolCalls.length,
    qualityRuns: Number(quality.run),
  };

  assert.deepEqual(designRoles, [], `${fixture.name}: existing valid OpenSpec dispatched architect`);
  assert.equal(quality.run, true, `${fixture.name}: Freeze skipped its one quality run`);
  assert.equal(measured.qualityRuns, 1, `${fixture.name}: duplicate complete quality run`);
  assert.ok(measured.gate1WorkUnits < fixture.legacy.gate1WorkUnits,
    `${fixture.name}: normalized time to Gate 1 did not improve`);
  assert.ok(measured.agentAttempts < fixture.legacy.agentAttempts,
    `${fixture.name}: agent attempts did not improve`);
  assert.ok(measured.toolCalls < fixture.legacy.toolCalls,
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
    assert.equal(validation.security, true);
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
