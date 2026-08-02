#!/usr/bin/env node
/**
 * Execute one argv command with bounded, terminal-safe diagnostic output.
 *
 * This helper deliberately accepts only an argv array. It never invokes a
 * shell and its envelope never contains the argv, environment, cwd, native
 * process identifiers, or a raw spawn error. Successful commands expose
 * accounting only unless their caller explicitly requests a bounded
 * success diagnostic; bounded rendered tails are otherwise reserved for
 * failures.
 */

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const BOUNDED_COMMAND_SCHEMA_VERSION = 1;
export const MAX_CAPTURE_BYTES_PER_STREAM = 64 * 1024;
export const MAX_RENDERED_TAIL_BYTES_PER_STREAM = 8 * 1024;
export const SUCCESS_DIAGNOSTIC_FLAG = "--success-diagnostic";

const MAX_ARGV_ITEMS = 128;
const MAX_ARGV_ITEM_BYTES = 8 * 1024;
const MAX_ARGV_BYTES = 64 * 1024;
const SAFE_SIGNAL = /^SIG[A-Z0-9]+$/;
const SAFE_TAIL = /^[\x20-\x7E]*$/;
const RESULT_KEYS = [
  "schema_version",
  "kind",
  "outcome",
  "exit_code",
  "signal",
  "duration_ms",
  "stdout",
  "stderr",
  "error_code",
];
const STREAM_KEYS = ["bytes", "truncated", "tail"];
const ERROR_CODES = new Set([null, "ARGUMENT_INVALID", "SPAWN_FAILED", "INTERNAL_ERROR"]);

const streamSchema = {
  type: "object",
  additionalProperties: false,
  required: STREAM_KEYS,
  properties: {
    bytes: { type: "integer", minimum: 0 },
    truncated: { type: "boolean" },
    tail: {
      anyOf: [
        { type: "null" },
        { type: "string", maxLength: MAX_RENDERED_TAIL_BYTES_PER_STREAM, pattern: "^[ -~]*$" },
      ],
    },
  },
};

/** Closed, versioned schema for every emitted result envelope. */
export const BOUNDED_COMMAND_ENVELOPE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "team-harness/bounded-command-envelope/v1",
  type: "object",
  additionalProperties: false,
  required: RESULT_KEYS,
  properties: {
    schema_version: { const: BOUNDED_COMMAND_SCHEMA_VERSION },
    kind: { const: "bounded_command" },
    outcome: { enum: ["completed", "spawn_error", "argument_invalid", "internal_error"] },
    exit_code: { anyOf: [{ type: "integer" }, { type: "null" }] },
    signal: { anyOf: [{ type: "string", pattern: "^SIG[A-Z0-9]+$" }, { type: "null" }] },
    duration_ms: { type: "integer", minimum: 0 },
    stdout: streamSchema,
    stderr: streamSchema,
    error_code: { anyOf: [{ type: "null" }, { enum: ["ARGUMENT_INVALID", "SPAWN_FAILED", "INTERNAL_ERROR"] }] },
  },
};

function hasExactlyKeys(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSafeTail(value) {
  return (
    value === null ||
    (typeof value === "string" &&
      Buffer.byteLength(value, "utf8") <= MAX_RENDERED_TAIL_BYTES_PER_STREAM &&
      SAFE_TAIL.test(value))
  );
}

function isStreamEnvelope(value) {
  return (
    hasExactlyKeys(value, STREAM_KEYS) &&
    isSafeInteger(value.bytes) &&
    typeof value.truncated === "boolean" &&
    isSafeTail(value.tail)
  );
}

/** Validate the fixed-shape result without relying on a third-party schema runtime. */
export function isBoundedCommandEnvelope(value) {
  if (!hasExactlyKeys(value, RESULT_KEYS)) return false;
  if (value.schema_version !== BOUNDED_COMMAND_SCHEMA_VERSION || value.kind !== "bounded_command") return false;
  if (!["completed", "spawn_error", "argument_invalid", "internal_error"].includes(value.outcome)) return false;
  if (value.exit_code !== null && !Number.isSafeInteger(value.exit_code)) return false;
  if (value.signal !== null && (typeof value.signal !== "string" || !SAFE_SIGNAL.test(value.signal))) return false;
  if (!isSafeInteger(value.duration_ms) || !isStreamEnvelope(value.stdout) || !isStreamEnvelope(value.stderr)) return false;
  if (!ERROR_CODES.has(value.error_code)) return false;

  if (value.outcome === "completed") return value.error_code === null;
  if (value.outcome === "spawn_error") {
    return value.error_code === "SPAWN_FAILED" && value.exit_code === null && value.signal === null;
  }
  if (value.outcome === "argument_invalid") {
    return value.error_code === "ARGUMENT_INVALID" && value.exit_code === null && value.signal === null;
  }
  return value.error_code === "INTERNAL_ERROR" && value.exit_code === null && value.signal === null;
}

function elapsedMilliseconds(startedAt) {
  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}

function validateOptions(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) throw new TypeError("invalid options");
  if (
    !Object.hasOwn(options, "argv") ||
    !Object.keys(options).every((key) => key === "argv" || key === "includeSuccessDiagnostic") ||
    !Array.isArray(options.argv)
  ) {
    throw new TypeError("invalid options");
  }
  const includeSuccessDiagnostic = Object.hasOwn(options, "includeSuccessDiagnostic")
    ? options.includeSuccessDiagnostic
    : false;
  if (typeof includeSuccessDiagnostic !== "boolean") throw new TypeError("invalid options");
  if (options.argv.length === 0 || options.argv.length > MAX_ARGV_ITEMS) throw new TypeError("invalid argv");

  let totalBytes = 0;
  for (const argument of options.argv) {
    if (typeof argument !== "string" || argument.length === 0 || argument.includes("\u0000")) {
      throw new TypeError("invalid argv");
    }
    const bytes = Buffer.byteLength(argument, "utf8");
    if (bytes > MAX_ARGV_ITEM_BYTES || totalBytes > MAX_ARGV_BYTES - bytes) throw new TypeError("invalid argv");
    totalBytes += bytes;
  }
  return { argv: options.argv.slice(), includeSuccessDiagnostic };
}

/**
 * Keeps only the rendered tail. All rendered bytes are printable ASCII, so
 * character count and byte count are identical.
 */
class RenderedTail {
  #chunks = [];
  #first = 0;
  #bytes = 0;

  append(value) {
    if (value.length === 0) return;
    this.#chunks.push(value);
    this.#bytes += value.length;

    while (this.#bytes > MAX_RENDERED_TAIL_BYTES_PER_STREAM) {
      const excess = this.#bytes - MAX_RENDERED_TAIL_BYTES_PER_STREAM;
      const firstChunk = this.#chunks[this.#first];
      if (firstChunk.length <= excess) {
        this.#bytes -= firstChunk.length;
        this.#first += 1;
      } else {
        this.#chunks[this.#first] = firstChunk.slice(excess);
        this.#bytes -= excess;
      }
    }

    // Drop expired chunk references regularly. This remains bounded even for
    // a command that emits an arbitrarily long single line in tiny chunks.
    if (this.#first >= 64 && this.#first * 2 >= this.#chunks.length) {
      this.#chunks = this.#chunks.slice(this.#first);
      this.#first = 0;
    }
  }

  value() {
    if (this.#bytes === 0) return null;
    return this.#chunks.slice(this.#first).join("");
  }
}

/**
 * Remove ANSI escape/control sequences before rendering. Remaining controls
 * and non-ASCII bytes are represented as printable `\\xNN` literals, so the
 * envelope can never inject terminal control bytes.
 */
class AnsiSafeRenderer {
  #tail = new RenderedTail();
  #state = "text";

  write(chunk) {
    for (let index = 0; index < chunk.length; index += 1) this.#writeByte(chunk[index]);
  }

  tail() {
    return this.#tail.value();
  }

  #writeByte(byte) {
    if (this.#state === "text") {
      if (byte === 0x1b) {
        this.#state = "escape";
      } else if (byte === 0x9b) {
        this.#state = "csi";
      } else if (byte === 0x9d) {
        this.#state = "string";
      } else if ([0x90, 0x98, 0x9e, 0x9f].includes(byte)) {
        this.#state = "string";
      } else if (byte !== 0x9c) {
        this.#tail.append(renderByte(byte));
      }
      return;
    }

    if (this.#state === "escape") {
      if (byte === 0x1b) {
        this.#state = "escape";
      } else if (byte === 0x5b) {
        this.#state = "csi";
      } else if (byte === 0x5d || [0x50, 0x58, 0x5e, 0x5f].includes(byte)) {
        this.#state = "string";
      } else {
        // An ESC final byte is itself a control sequence; remove it too.
        this.#state = "text";
      }
      return;
    }

    if (this.#state === "csi") {
      if (byte === 0x1b) {
        this.#state = "escape";
      } else if (byte >= 0x40 && byte <= 0x7e) {
        this.#state = "text";
      }
      return;
    }

    if (this.#state === "string") {
      if (byte === 0x07 || byte === 0x9c) {
        this.#state = "text";
      } else if (byte === 0x1b) {
        this.#state = "string_escape";
      }
      return;
    }

    // ESC \\ terminates OSC/DCS/SOS/PM/APC strings. Anything else remains
    // inside the stripped string, including a second ESC (which may begin ST).
    if (byte === 0x5c) {
      this.#state = "text";
    } else if (byte !== 0x1b) {
      this.#state = "string";
    }
  }
}

function renderByte(byte) {
  if (byte >= 0x20 && byte <= 0x7e) return String.fromCharCode(byte);
  return `\\x${byte.toString(16).toUpperCase().padStart(2, "0")}`;
}

/**
 * Counts every received byte while retaining only an 8 KiB sanitised tail.
 * That retention is strictly below the 64 KiB raw-capture ceiling, including
 * when a child writes one giant line in a single chunk.
 */
class StreamCapture {
  #bytes = 0;
  #truncated = false;
  #renderer = new AnsiSafeRenderer();

  write(chunk) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (this.#bytes > Number.MAX_SAFE_INTEGER - bytes.length) throw new RangeError("byte count overflow");
    this.#bytes += bytes.length;
    if (this.#bytes > MAX_CAPTURE_BYTES_PER_STREAM) this.#truncated = true;
    this.#renderer.write(bytes);
  }

  snapshot(includeTail) {
    return {
      bytes: this.#bytes,
      truncated: this.#truncated,
      tail: includeTail ? this.#renderer.tail() : null,
    };
  }
}

function emptyCapture() {
  return new StreamCapture();
}

function buildEnvelope({ outcome, exitCode, signal, durationMs, stdout, stderr, errorCode, diagnostic }) {
  const envelope = {
    schema_version: BOUNDED_COMMAND_SCHEMA_VERSION,
    kind: "bounded_command",
    outcome,
    exit_code: exitCode,
    signal,
    duration_ms: durationMs,
    stdout: stdout.snapshot(diagnostic),
    stderr: stderr.snapshot(diagnostic),
    error_code: errorCode,
  };
  if (!isBoundedCommandEnvelope(envelope)) {
    // The fallback is also closed and contains no information from the child.
    return {
      schema_version: BOUNDED_COMMAND_SCHEMA_VERSION,
      kind: "bounded_command",
      outcome: "internal_error",
      exit_code: null,
      signal: null,
      duration_ms: 0,
      stdout: { bytes: 0, truncated: false, tail: null },
      stderr: { bytes: 0, truncated: false, tail: null },
      error_code: "INTERNAL_ERROR",
    };
  }
  return envelope;
}

function invalidArgumentsEnvelope() {
  return buildEnvelope({
    outcome: "argument_invalid",
    exitCode: null,
    signal: null,
    durationMs: 0,
    stdout: emptyCapture(),
    stderr: emptyCapture(),
    errorCode: "ARGUMENT_INVALID",
    diagnostic: false,
  });
}

function normaliseSignal(signal) {
  return typeof signal === "string" && SAFE_SIGNAL.test(signal) ? signal : null;
}

function normaliseExitCode(exitCode) {
  return Number.isSafeInteger(exitCode) ? exitCode : null;
}

/**
 * Execute exactly one argv command. Invalid inputs and spawn failures resolve
 * to a safe envelope rather than throwing or echoing any user-controlled data.
 */
export async function runBoundedCommand(options) {
  let command;
  try {
    command = validateOptions(options);
  } catch {
    return invalidArgumentsEnvelope();
  }
  const { argv, includeSuccessDiagnostic } = command;

  const startedAt = process.hrtime.bigint();
  const stdout = new StreamCapture();
  const stderr = new StreamCapture();
  let child;
  try {
    child = spawn(argv[0], argv.slice(1), {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch {
    return buildEnvelope({
      outcome: "spawn_error",
      exitCode: null,
      signal: null,
      durationMs: elapsedMilliseconds(startedAt),
      stdout,
      stderr,
      errorCode: "SPAWN_FAILED",
      diagnostic: true,
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    let spawnFailed = false;
    let streamFailed = false;

    const settle = (outcome, exitCode, signal, errorCode) => {
      if (settled) return;
      settled = true;
      const safeExitCode = normaliseExitCode(exitCode);
      const safeSignal = normaliseSignal(signal);
      const diagnostic =
        includeSuccessDiagnostic || outcome !== "completed" || safeExitCode !== 0 || safeSignal !== null;
      resolve(
        buildEnvelope({
          outcome,
          exitCode: outcome === "completed" ? safeExitCode : null,
          signal: outcome === "completed" ? safeSignal : null,
          durationMs: elapsedMilliseconds(startedAt),
          stdout,
          stderr,
          errorCode,
          diagnostic,
        }),
      );
    };

    const capture = (stream) => (chunk) => {
      try {
        stream.write(chunk);
      } catch {
        // The raw exception may include stream implementation detail; never
        // expose it. Continue draining so the child is not blocked on output.
        streamFailed = true;
      }
    };

    if (child.stdout === null || child.stderr === null) {
      streamFailed = true;
    } else {
      child.stdout.on("data", capture(stdout));
      child.stderr.on("data", capture(stderr));
      child.stdout.once("error", () => {
        streamFailed = true;
      });
      child.stderr.once("error", () => {
        streamFailed = true;
      });
    }

    child.once("error", () => {
      spawnFailed = true;
      settle("spawn_error", null, null, "SPAWN_FAILED");
    });
    child.once("close", (exitCode, signal) => {
      if (spawnFailed) {
        settle("spawn_error", null, null, "SPAWN_FAILED");
      } else if (streamFailed || (exitCode !== null && !Number.isSafeInteger(exitCode))) {
        settle("internal_error", null, null, "INTERNAL_ERROR");
      } else {
        settle("completed", exitCode, signal, null);
      }
    });
  });
}

function parseCli(argv) {
  let separatorIndex = 0;
  let includeSuccessDiagnostic = false;
  if (argv[0] === SUCCESS_DIAGNOSTIC_FLAG) {
    includeSuccessDiagnostic = true;
    separatorIndex = 1;
  }

  if (argv.length <= separatorIndex + 1 || argv[separatorIndex] !== "--") return null;
  // The helper flag is meaningful only before its separator. Treat a misplaced
  // leading flag as invalid instead of trying to execute it as an argv command.
  if (!includeSuccessDiagnostic && argv[separatorIndex + 1] === SUCCESS_DIAGNOSTIC_FLAG) return null;
  return { argv: argv.slice(separatorIndex + 1), includeSuccessDiagnostic };
}

async function main(argv) {
  const options = parseCli(argv);
  return options === null ? invalidArgumentsEnvelope() : runBoundedCommand(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envelope = await main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}
