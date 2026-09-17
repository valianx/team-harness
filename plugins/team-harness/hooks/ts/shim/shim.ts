// hooks/ts/shim/shim.ts
// Format-shim: bounds and normalizes Claude Code hook payloads before the
// retained context and observability bodies inspect them.
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
import {
  NormalizedInput,
  MAX_PAYLOAD_BYTES,
  MAX_NESTING_DEPTH,
  VALID_EVENTS,
} from "./normalized-v1.js";

/** SEC-07 hard-reject signal. Retained entries handle it fail-open. */
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
  parsed: Record<string, unknown>
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

  return { event, tool, runtime: "claude-code", workspace, dataHome };
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
  return buildNormalized(mapped);
}
