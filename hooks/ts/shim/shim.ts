// hooks/ts/shim/shim.ts
// Format-shim: enforces SEC-07 on inbound payloads and translates
// canonical NormalizedDecision into the runtime's native control signal.
//
// SEC-07 contract (inbound):
//   1. Size bound — O(n) length check BEFORE JSON.parse (CWE-770).
//   2. Depth bound — O(n) PRE-PARSE structural-token scan over raw string
//      (not post-parse; does NOT rely on engine RangeError at ~10000 levels).
//   3. Safe parse — JSON.parse (no eval).
//   4. Named-key read — ONLY the listed normalized-v1 keys, by direct property
//      access. PROHIBITS: Object.assign spread, for..in, Object.keys over the
//      raw parsed object. Unknown keys are ignored by construction.
//   5. Pollution rejection (defense-in-depth) — __proto__/constructor/prototype
//      keys cause hard-reject BEFORE named-key read (redundant by design with #4).
//   6. Schema validate — wrong type = hard reject (no coercion); absent = null.
//
// Outbound (CC): decision → stdout JSON + process.exit(0).
// Outbound (opencode): decision → return (allow/none) or throw (deny/ask→throw
//   for outward/gcp gates per fail-closed mapping). NEVER writes output.args.

import {
  NormalizedInput,
  NormalizedDecision,
  MAX_PAYLOAD_BYTES,
  MAX_NESTING_DEPTH,
  VALID_EVENTS,
} from "./normalized-v1.js";

/** SEC-07 hard-reject signal. The entry wrapper maps this to the gate's
 *  per-gate fail-closed default (deny for security gates, none for no-op
 *  gates like dev-guard on non-covered Bash). */
export class ShimRejectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShimRejectError";
  }
}

// ---------------------------------------------------------------------------
// SEC-07 helpers — all operate on the RAW string, before JSON.parse
// ---------------------------------------------------------------------------

/** O(n) length check on the raw string, before JSON.parse.
 *  Uses byte count (UTF-8) so the gate aligns with MAX_PAYLOAD_BYTES semantics.
 *  Buffer.byteLength (Node) and TextEncoder (both Node ≥11 and Bun) both return
 *  the UTF-8 byte length — no allocation of a new buffer, just a walk of the string. */
function checkSize(raw: string): void {
  // fix(shim): count UTF-8 bytes, not JS char units (multi-byte chars were under-counted)
  const byteLen =
    typeof Buffer !== "undefined"
      ? Buffer.byteLength(raw, "utf8")
      : new TextEncoder().encode(raw).byteLength;
  if (byteLen > MAX_PAYLOAD_BYTES) {
    throw new ShimRejectError(
      `SEC-07: payload exceeds max size (${byteLen} bytes > ${MAX_PAYLOAD_BYTES})`
    );
  }
}

/** O(n) PRE-PARSE structural-token scan. Counts open/close structural tokens
 *  ({/[ vs }/]) skipping string literals and escape sequences, and rejects if
 *  nesting depth exceeds MAX_NESTING_DEPTH. Does NOT call JSON.parse. Does NOT
 *  rely on the engine's internal RangeError. */
function checkDepth(raw: string): void {
  let depth = 0;
  let inString = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (inString) {
      if (ch === "\\") {
        // Skip the escaped character (covers \", \\, \n, \uXXXX etc.)
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      depth++;
      if (depth > MAX_NESTING_DEPTH) {
        throw new ShimRejectError(
          `SEC-07: payload nesting depth exceeds max (${depth} > ${MAX_NESTING_DEPTH})`
        );
      }
    } else if (ch === "}" || ch === "]") {
      depth--;
    }

    i++;
  }
}

/** Defense-in-depth: reject parsed objects carrying prototype-pollution keys.
 *  This is REDUNDANT by design with named-key read — a pollution key is never
 *  read by name, so it cannot reach Object.prototype regardless. But the
 *  explicit check catches the class of attack at the earliest opportunity. */
function rejectPollutionKeys(obj: Record<string, unknown>): void {
  const dangerous = ["__proto__", "constructor", "prototype"];
  for (const key of dangerous) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      throw new ShimRejectError(
        `SEC-07: payload contains forbidden key '${key}' (prototype-pollution attempt)`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Named-key reader — PRIMARY barrier against unknown keys (SEC-DR-D)
// Reads ONLY the listed normalized-v1 keys by direct property access.
// NO Object.assign, NO spread, NO for..in, NO Object.keys over the parsed obj.
// ---------------------------------------------------------------------------

function buildNormalized(
  parsed: Record<string, unknown>,
  runtime: "claude-code" | "opencode"
): NormalizedInput {
  // Read `event` — must be a valid event string.
  const rawEvent = parsed["event"];
  if (typeof rawEvent !== "string" || !VALID_EVENTS.has(rawEvent)) {
    throw new ShimRejectError(
      `SEC-07: 'event' must be a valid event string, got ${typeof rawEvent}`
    );
  }
  const event = rawEvent as NormalizedInput["event"];

  // Read `tool` — object with name+input, or absent (→ null).
  let tool: NormalizedInput["tool"] = null;
  const rawTool = parsed["tool"];
  if (rawTool !== undefined && rawTool !== null) {
    if (typeof rawTool !== "object" || Array.isArray(rawTool)) {
      throw new ShimRejectError("SEC-07: 'tool' must be an object or absent");
    }
    const toolObj = rawTool as Record<string, unknown>;
    rejectPollutionKeys(toolObj);

    const rawName = toolObj["name"];
    if (typeof rawName !== "string") {
      throw new ShimRejectError("SEC-07: 'tool.name' must be a string");
    }
    const rawInput = toolObj["input"];
    // tool.input is an opaque bag; must be an object (or absent → empty).
    const toolInput: Record<string, unknown> =
      rawInput !== undefined &&
      rawInput !== null &&
      typeof rawInput === "object" &&
      !Array.isArray(rawInput)
        ? (rawInput as Record<string, unknown>)
        : {};
    tool = { name: rawName, input: toolInput };
  }

  // Read `workspace` — string or absent (→ null).
  const rawWorkspace = parsed["workspace"];
  if (rawWorkspace !== undefined && rawWorkspace !== null && typeof rawWorkspace !== "string") {
    throw new ShimRejectError("SEC-07: 'workspace' must be a string or absent");
  }
  const workspace = typeof rawWorkspace === "string" ? rawWorkspace : null;

  // Read `dataHome` — string or absent (→ null).
  const rawDataHome = parsed["dataHome"];
  if (rawDataHome !== undefined && rawDataHome !== null && typeof rawDataHome !== "string") {
    throw new ShimRejectError("SEC-07: 'dataHome' must be a string or absent");
  }
  const dataHome = typeof rawDataHome === "string" ? rawDataHome : null;

  return { event, tool, workspace, runtime, dataHome };
}

// ---------------------------------------------------------------------------
// CC-specific helpers: extract event + tool fields from CC's native stdin format
// ---------------------------------------------------------------------------
// CC sends: { tool_name: string, tool_input: object, ... }
// We map this into normalized-v1 fields.
function parseCCPayload(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ShimRejectError("SEC-07: payload is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ShimRejectError("SEC-07: payload must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  rejectPollutionKeys(obj);

  // CC's native format uses `tool_name` + `tool_input`; translate to normalized-v1.
  const toolName = obj["tool_name"];
  const toolInput = obj["tool_input"];

  // Build normalized representation merging CC format into normalized-v1 shape.
  const normalized: Record<string, unknown> = {
    event: "PreToolUse", // CC hook event for this payload shape
    tool:
      typeof toolName === "string"
        ? {
            name: toolName,
            input:
              typeof toolInput === "object" && toolInput !== null && !Array.isArray(toolInput)
                ? toolInput
                : {},
          }
        : null,
    workspace: obj["workspace"] ?? null,
    dataHome: obj["dataHome"] ?? null,
  };

  return normalized;
}

// ---------------------------------------------------------------------------
// Public API — Inbound
// ---------------------------------------------------------------------------

/** Inbound (CC): raw stdin string → validated NormalizedInput.
 *  Throws ShimRejectError on any SEC-07 violation (caller maps to fail-closed). */
export function inboundCC(raw: string): NormalizedInput {
  checkSize(raw);
  checkDepth(raw);
  const mapped = parseCCPayload(raw);
  return buildNormalized(mapped, "claude-code");
}

/** Inbound (opencode): the (input, output) callback args → frozen NormalizedInput.
 *  Returns a frozen (readonly) object: the body cannot mutate it, and it holds
 *  no reference to opencode's mutable native `output` (SEC-DR-F). */
export function inboundOpencode(
  input: unknown,
  _output: unknown
): Readonly<NormalizedInput> {
  // opencode passes `input` as { tool: string, args: object, ... }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ShimRejectError("SEC-07: opencode input must be an object");
  }
  const obj = input as Record<string, unknown>;
  rejectPollutionKeys(obj);

  // Serialize to string for the size/depth bounds check.
  // NOTE: we serialise the opencode input object, not the entire callback scope.
  let raw: string;
  try {
    raw = JSON.stringify(obj);
  } catch {
    throw new ShimRejectError("SEC-07: opencode input not serialisable");
  }
  checkSize(raw);
  checkDepth(raw);

  // opencode native format: { tool: string, args: { command?: string, ... } }
  const toolName = obj["tool"];
  const toolArgs = obj["args"];

  const mapped: Record<string, unknown> = {
    event: "PreToolUse",
    tool:
      typeof toolName === "string"
        ? {
            name: toolName,
            input:
              typeof toolArgs === "object" && toolArgs !== null && !Array.isArray(toolArgs)
                ? toolArgs
                : {},
          }
        : null,
    workspace: obj["workspace"] ?? null,
    dataHome: obj["dataHome"] ?? null,
  };

  const result = buildNormalized(mapped, "opencode");

  // Deep-freeze the normalized input so the body receives a truly readonly view.
  // Any attempted write throws in strict mode (SEC-DR-F structural barrier).
  if (result.tool?.input) {
    Object.freeze(result.tool.input);
  }
  if (result.tool) {
    Object.freeze(result.tool);
  }
  Object.freeze(result);

  return result as Readonly<NormalizedInput>;
}

// ---------------------------------------------------------------------------
// Public API — Outbound
// ---------------------------------------------------------------------------

/** Outbound (CC): decision → stdout JSON + process.exit(0).
 *  "none" → empty stdout + exit 0.
 *  "deny"/"ask"/"allow" → hookSpecificOutput permissionDecision JSON. */
export function outboundCC(d: NormalizedDecision): never {
  if (d.decision === "none") {
    process.stdout.write("");
    process.exit(0);
  }
  const payload = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: d.decision,
      permissionDecisionReason: d.reason,
    },
  };
  process.stdout.write(JSON.stringify(payload) + "\n");
  process.exit(0);
}

/** Outbound (opencode): decision → return (allow/none) or throw (deny/ask→throw).
 *  Reads ONLY the body's decision; NEVER writes opencode's mutable output.args.
 *  ask→throw for outward/gcp gates (fail-closed mapping — opencode has no interactive
 *  operator-confirm; an un-prompted outward action is exactly the harm dev-guard prevents). */
export function outboundOpencode(d: NormalizedDecision): void {
  if (d.decision === "allow" || d.decision === "none") {
    return;
  }
  // deny and ask both throw (fail-closed mapping for opencode).
  // Error.message names the pattern CLASS, never the captured value (CWE-200).
  throw new Error(d.reason || d.decision);
}
