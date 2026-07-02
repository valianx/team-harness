// hooks/ts/bodies/gcp-guard.ts
// Canonical body — verbatim port of hooks/gcp-guard.sh decision logic.
// Runtime-pure: imports no runtime symbol; reads only NormalizedInput;
// returns only NormalizedDecision. Never branches on `input.runtime`.
//
// VERB CLASSIFICATION (canonical — matches docs/gcp-infra.md):
//   READ-ONLY (none): list, describe, get/get-*, search-all-resources, simulator,
//     replay-recent-access, recommendations, print-*, --dry-run, --validate-only.
//   MUTATING (ask): create, update, patch, add-*, set-*, enable, disable,
//     resize, start, stop, deploy, import, add-iam-policy-binding, set-iam-policy.
//   DESTRUCTIVE (ask with irreversibility): delete, remove-*, remove-iam-policy-binding,
//     purge, clear-*, destroy.
//   CATASTROPHIC (deny): projects delete, resource-manager folders delete,
//     organizations * delete.
//
// PRECEDENCE: strongest class across all gcloud invocations wins.
// Fail-closed contract: catastrophic → deny; destructive → ask; mutating → ask;
//   read-only → none; unparseable gcloud → scan raw for catastrophic/destructive tokens.
//
// NEVER emits allow. NEVER imports hook-profile helper (enforcement floor).

import type { NormalizedInput, NormalizedDecision } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

function ask(reason: string): NormalizedDecision {
  return { decision: "ask", reason, mutations: null };
}

function deny(reason: string): NormalizedDecision {
  return { decision: "deny", reason, mutations: null };
}

function none(): NormalizedDecision {
  return { decision: "none", reason: "", mutations: null };
}

// ---------------------------------------------------------------------------
// Verb classification
// Class strength: 4=catastrophic > 3=destructive > 2=mutating > 1=read-only > 0=none
// ---------------------------------------------------------------------------

type VerbClass = 0 | 1 | 2 | 3 | 4;

const READ_ONLY_RE = /^(list|describe|search-all-resources|simulator|replay-recent-access|recommendations|get|get-.+|print-.+)$/;
const DESTRUCTIVE_RE = /^(delete|remove-.+|remove-iam-policy-binding|purge|clear-.+|destroy)$/;
const MUTATING_RE = /^(create|update|patch|add-.+|set-.+|enable|disable|resize|start|stop|deploy|import|add-iam-policy-binding|set-iam-policy)$/;

// Catastrophic full-segment patterns.
const CATASTROPHIC_PROJECTS_RE = /gcloud\s+.*projects\s+delete/;
const CATASTROPHIC_FOLDERS_RE = /gcloud\s+.*resource-manager\s+folders\s+delete/;
const CATASTROPHIC_ORGS_RE = /gcloud\s+.*organizations\s+[^\s"]+\s+delete([\s"]|$)/;

// Fail-safe raw-payload patterns (Step 5 equivalent).
const RAW_CATASTROPHIC_RE =
  /projects\s+delete|resource-manager\s+folders\s+delete|organizations\s+[^\s"]+\s+delete([\s"]|$)/;
const RAW_DESTRUCTIVE_RE =
  /(^|\s)(delete|remove-[a-z]|purge|clear-[a-z]|destroy)(\s|$|")/;

// Segment-level destructive/catastrophic strengthening scan (mirrors fix(sec-001+sec-002)).
const SEG_DESTRUCTIVE_RE = /(^|\s)(delete|destroy|purge)(\s|$)/;
const SEG_REMOVE_RE = /(^|\s)remove-[a-z]/;

// ---------------------------------------------------------------------------
// Classify a single gcloud segment (a command separated by &&, ;, |, \n).
// Returns [class, verb, resource].
// ---------------------------------------------------------------------------

function classifySegment(segment: string): [VerbClass, string, string] {
  // Check for --dry-run or --validate-only → treat as read-only.
  if (/--dry-run|--validate-only/.test(segment)) {
    return [1, "dry-run/validate-only", ""];
  }

  // Catastrophic patterns first (highest priority).
  if (CATASTROPHIC_PROJECTS_RE.test(segment)) {
    const res =
      (segment.match(/projects\s+delete\s+(\S+)/) ?? [])[1] ?? "";
    return [4, "projects delete", res];
  }
  if (CATASTROPHIC_FOLDERS_RE.test(segment)) {
    const res =
      (segment.match(/folders\s+delete\s+(\S+)/) ?? [])[1] ?? "";
    return [4, "resource-manager folders delete", res];
  }
  if (CATASTROPHIC_ORGS_RE.test(segment)) {
    const res =
      (segment.match(/organizations\s+\S+\s+delete\s+(\S*)/) ?? [])[1] ?? "";
    return [4, "organizations delete", res];
  }

  // Extract words after "gcloud", strip leading -- flags, take first 5.
  const afterGcloud = segment.replace(/.*gcloud\s+/, "");
  const words = afterGcloud
    .split(/\s+/)
    .filter((w) => w && !w.startsWith("--"))
    .slice(0, 5);

  let segClass: VerbClass = 0;
  let segVerb = "";

  for (const word of words) {
    if (READ_ONLY_RE.test(word)) {
      if (segClass < 1) { segClass = 1; segVerb = word; }
    } else if (DESTRUCTIVE_RE.test(word) && segClass < 3) {
      segClass = 3; segVerb = word;
    } else if (MUTATING_RE.test(word) && segClass < 2) {
      segClass = 2; segVerb = word;
    }
  }

  // Additive strengthening pass (catches verbs past word 5, e.g. bash -c "gcloud...delete").
  if (CATASTROPHIC_PROJECTS_RE.test(segment)) {
    segClass = 4; segVerb = "projects delete";
  } else if (CATASTROPHIC_FOLDERS_RE.test(segment)) {
    segClass = 4; segVerb = "resource-manager folders delete";
  } else if (CATASTROPHIC_ORGS_RE.test(segment)) {
    segClass = 4; segVerb = "organizations delete";
  } else if (segClass < 3 && SEG_DESTRUCTIVE_RE.test(segment)) {
    segClass = 3; segVerb = "delete";
  } else if (segClass < 3 && SEG_REMOVE_RE.test(segment)) {
    segClass = 3; segVerb = "remove-*";
  }

  return [segClass, segVerb, ""];
}

// ---------------------------------------------------------------------------
// Public evaluate() — the single entry point every runtime calls.
// ---------------------------------------------------------------------------

export function evaluate(input: NormalizedInput): NormalizedDecision {
  const toolName = input.tool?.name ?? "";
  if (toolName !== "Bash") return none();

  // Extract command from tool.input.command (absent/non-string → null, never
  // an empty string) — mirrors dev-guard.ts's cmdStr derivation so an absent
  // field routes to the raw-payload fail-safe below instead of short-circuiting.
  const cmdRaw = input.tool?.input?.["command"];
  const cmd = typeof cmdRaw === "string" ? cmdRaw : null;

  // ---------------------------------------------------------------------------
  // Step 5 — Fail-safe path: command field absent or non-string. Scan the raw
  // payload representation for catastrophic/destructive tokens before giving
  // up — a malformed payload must never silently defer past a catastrophic
  // gcloud verb just because the structured command could not be extracted.
  // ---------------------------------------------------------------------------
  if (cmd === null) {
    const rawRepr = JSON.stringify(input.tool?.input ?? {});
    if (RAW_CATASTROPHIC_RE.test(rawRepr)) {
      return deny(
        "gcp-guard: catastrophic operation detected in unparseable payload — project/org/folder deletion is permanently blocked; run manually if truly intended (gcp-guard.ts)"
      );
    }
    if (RAW_DESTRUCTIVE_RE.test(rawRepr)) {
      return ask(
        "gcp-guard: destructive gcloud verb detected in unparseable payload — operation requires explicit operator approval; irreversible, cannot be undone (gcp-guard.ts)"
      );
    }
    return none();
  }

  // No gcloud token at all → fast-exit.
  if (!cmd.includes("gcloud")) {
    return none();
  }

  // ---------------------------------------------------------------------------
  // Step 6 — Classify all gcloud invocations in the command.
  // Split on common command separators (&&, ;, |, \n).
  // ---------------------------------------------------------------------------

  const segments = cmd.split(/[;&|\n]+/).map((s) => s.trim()).filter(Boolean);

  let strongestClass: VerbClass = 0;
  let strongestVerb = "";
  let strongestResource = "";

  for (const segment of segments) {
    // Skip if segment doesn't contain gcloud.
    if (!segment.includes("gcloud")) continue;

    const [segClass, segVerb, segResource] = classifySegment(segment);
    if (segClass > strongestClass) {
      strongestClass = segClass;
      strongestVerb = segVerb;
      strongestResource = segResource;
    }

    // Short-circuit: catastrophic is the maximum possible class.
    if (strongestClass >= 4) break;
  }

  // ---------------------------------------------------------------------------
  // Step 7 — Emit decision based on strongest class.
  // ---------------------------------------------------------------------------

  switch (strongestClass) {
    case 0:
    case 1:
      // No gcloud verb classified, or read-only only — no decision.
      return none();

    case 2:
      return ask(
        `gcp-guard: gcloud mutating operation '${strongestVerb}' requires explicit operator approval — this will modify GCP resources (create/update/configure/start/stop). Review the blast radius before confirming (gcp-guard.ts; see docs/gcp-infra.md)`
      );

    case 3: {
      const resourceNote = strongestResource ? ` (resource: ${strongestResource})` : "";
      return ask(
        `gcp-guard: gcloud DESTRUCTIVE operation '${strongestVerb}' requires explicit operator approval — this operation is IRREVERSIBLE and will permanently delete or remove GCP resources${resourceNote}. Verify blast radius and confirm intentionally (gcp-guard.ts; see docs/gcp-infra.md)`
      );
    }

    case 4:
      return deny(
        `gcp-guard: CATASTROPHIC operation '${strongestVerb}' is permanently blocked — project/organization/folder deletion destroys all contained resources and is non-recoverable. Run manually outside Claude only if absolutely certain (gcp-guard.ts; see docs/gcp-infra.md)`
      );

    default:
      // Unexpected class value — fail-safe: nodecision.
      return none();
  }
}
