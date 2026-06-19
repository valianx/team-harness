#!/usr/bin/env node
// tools/harness-migrate/migrate.mjs
// Bidirectional deterministic transform: Claude Code <-> opencode agent/command files.
//
// Usage:
//   node tools/harness-migrate/migrate.mjs to-opencode
//   node tools/harness-migrate/migrate.mjs to-claude-code
//
// Transforms:
//   - agents/            <->  .opencode/agents/
//   - .claude/commands/  <->  .opencode/commands/
//
// Security contracts (mirrors SEC-01, SEC-02, SEC-08 from the roadmap):
//   - Write-path containment: realpath-canonicalize every output path; segment-prefix
//     strict-descendant check; reject residual ".."; refuse symlink escape;
//     writable-prefix allowlist; O_NOFOLLOW leaf write (no re-lookup by name, TOCTOU close).
//   - Batch fail-closed: dry-run validates ALL output paths before any write.
//   - Injection-form rejection: reject any source carrying either shell-injection form
//     (inline bang-backtick and fenced triple-backtick-bang) over both body and frontmatter values.
//   - Named-key allowlist: no spread/merge; prototype-pollution keys rejected.

import { promises as fs, constants as fsConstants } from "node:fs";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import * as url from "node:url";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIRECTION_TO_OPENCODE = "to-opencode";
const DIRECTION_TO_CC = "to-claude-code";

/** Provider prefix used on the opencode side. */
const ANTHROPIC_PREFIX = "anthropic/";

/** Mode values injected by the forward pass, dropped on inverse for CC-origin files. */
const INJECTED_MODE_VALUES = new Set(["primary", "subagent", "all"]);

/** Writable-prefix allowlist: directories the transform is permitted to write into,
 *  relative to the repo root (forward-slash normalized, no trailing slash). */
const WRITABLE_PREFIXES = [
  ".opencode/agents",
  ".opencode/commands",
  "agents",
  ".claude/commands",
];

/** Prototype-pollution keys to reject (mirrors shim.ts:rejectPollutionKeys). */
const POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

class ContainmentError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContainmentError";
  }
}

class InjectionError extends Error {
  constructor(message) {
    super(message);
    this.name = "InjectionError";
  }
}

class MarkerContradictionError extends Error {
  constructor(message) {
    super(message);
    this.name = "MarkerContradictionError";
  }
}

// ---------------------------------------------------------------------------
// Repo-root resolution (SEC-01 analogue)
// ---------------------------------------------------------------------------

/**
 * Resolve the repo root. Tries git rev-parse first; falls back to an
 * ancestor-walk that accepts .git as either a directory or a gitfile
 * (nested worktrees have .git as a file pointing at the real gitdir).
 * The result is realpath-canonicalized and verified not to be a symlink.
 */
async function getRepoRoot() {
  let raw = null;

  // Attempt git first (returns worktree toplevel when run inside a worktree).
  try {
    const out = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (out) raw = out;
  } catch {
    // git absent or non-zero — fall through to ancestor walk.
  }

  if (!raw) {
    // Ancestor-walk: walk up from this script's directory looking for .git
    // (directory or gitfile — both are valid repo root indicators).
    const scriptDir = path.dirname(url.fileURLToPath(import.meta.url));
    let dir = scriptDir;
    const { root: fsRoot } = path.parse(dir);
    while (dir !== fsRoot) {
      const candidate = path.join(dir, ".git");
      try {
        await fs.access(candidate);
        raw = dir;
        break;
      } catch {
        dir = path.dirname(dir);
      }
    }
  }

  if (!raw) {
    throw new ContainmentError(
      "Cannot resolve repo root: not in a git repository and ancestor-walk found no .git"
    );
  }

  // Realpath-canonicalize to resolve any symlinks in the root path itself.
  const canonical = await fs.realpath(raw);

  // SEC-01: verify the resolved root is not itself a symlink.
  const rootStat = await fs.lstat(canonical);
  if (rootStat.isSymbolicLink()) {
    throw new ContainmentError(
      `SEC-01: resolved repo root is a symlink — refusing to use as containment anchor: ${canonical}`
    );
  }

  return canonical;
}

// ---------------------------------------------------------------------------
// Frontmatter parser / serializer (minimal, zero external deps)
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a Markdown string.
 * Returns { frontmatter: object, body: string }.
 * Handles: scalars, arrays (- item), nested objects with scalar or array values.
 * Does NOT implement full YAML — only the shapes used in agent/command files.
 */
function parseFrontmatter(content) {
  if (!content.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }
  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) {
    return { frontmatter: {}, body: content };
  }
  const fmText = content.slice(4, endIdx);
  const body = content.slice(endIdx + 4).replace(/^\n/, "");

  // Use a null-prototype object so __proto__ can be set as an own property.
  const fm = Object.create(null);
  const lines = fmText.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) { i++; continue; }

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trimStart();

    // Array value: rest empty, next lines are "  - item"
    if (rest === "" && i + 1 < lines.length && lines[i + 1].trim().startsWith("-")) {
      const arr = [];
      i++;
      while (i < lines.length && lines[i].trim().startsWith("-")) {
        arr.push(lines[i].trim().slice(1).trim());
        i++;
      }
      fm[key] = arr;
      continue;
    }

    // Nested object: rest empty, next lines are "  key: val"
    if (rest === "" && i + 1 < lines.length && /^\s{2,}\w/.test(lines[i + 1])) {
      const obj = Object.create(null);
      i++;
      while (i < lines.length && /^\s{2,}/.test(lines[i])) {
        const innerLine = lines[i].trim();
        const innerColon = innerLine.indexOf(":");
        if (innerColon !== -1) {
          const innerKey = innerLine.slice(0, innerColon).trim();
          const innerRest = innerLine.slice(innerColon + 1).trimStart();
          // Check if innerRest starts an indented array
          if (innerRest === "" && i + 1 < lines.length && /^\s{4,}-/.test(lines[i + 1])) {
            const innerArr = [];
            i++;
            while (i < lines.length && /^\s{4,}-/.test(lines[i])) {
              innerArr.push(lines[i].trim().slice(1).trim());
              i++;
            }
            obj[innerKey] = innerArr;
            continue;
          }
          obj[innerKey] = parseScalar(innerRest);
        }
        i++;
      }
      fm[key] = obj;
      continue;
    }

    fm[key] = parseScalar(rest);
    i++;
  }

  return { frontmatter: fm, body };
}

function parseScalar(s) {
  if (s === "true") return true;
  if (s === "false") return false;
  const n = Number(s);
  if (s !== "" && !isNaN(n)) return n;
  // Strip surrounding quotes.
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Serialize a frontmatter object + body back to a Markdown string.
 */
function serializeFrontmatter(fm, body) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fm)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else if (value !== null && typeof value === "object") {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) {
        if (Array.isArray(v)) {
          lines.push(`  ${k}:`);
          for (const item of v) {
            lines.push(`    - ${item}`);
          }
        } else {
          lines.push(`  ${k}: ${v}`);
        }
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  return lines.join("\n") + "\n" + body;
}

// ---------------------------------------------------------------------------
// Prototype-pollution guard (mirrors shim.ts:rejectPollutionKeys)
// ---------------------------------------------------------------------------

function rejectPollutionKeys(obj) {
  for (const key of POLLUTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      throw new ContainmentError(
        `Prototype-pollution key detected in frontmatter: '${key}'`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Shell-injection detection — BOTH documented forms, over body + frontmatter values
// ---------------------------------------------------------------------------

/**
 * Checks a string for EITHER documented shell-injection form:
 *
 *   (a) Inline form: bang immediately followed by backtick — non-anchored substring.
 *       The grep is NOT line-anchored: covers start-of-line AND post-whitespace cases.
 *       This is a fixed security requirement — do NOT narrow to a line-anchored pattern.
 *
 *   (b) Fenced form: three backticks immediately followed by bang (multi-line shell block).
 *
 * Returns a description of the injection form found, or null if clean.
 */
function detectInjectionForm(text) {
  // (a) Inline form — non-anchored; catches any position in the line.
  if (text.includes("!\x60")) {
    return "inline-injection (bang-backtick)";
  }
  // (b) Fenced form — three backticks followed by bang.
  if (text.includes("\x60\x60\x60!")) {
    return "fenced-injection (triple-backtick-bang)";
  }
  return null;
}

/**
 * Checks both the body and all frontmatter string values for injection forms.
 * Throws InjectionError on any hit.
 */
function assertNoInjection(filePath, frontmatter, body) {
  const bodyHit = detectInjectionForm(body);
  if (bodyHit) {
    throw new InjectionError(
      `Shell-injection form detected in body of '${filePath}': ${bodyHit}`
    );
  }
  checkFrontmatterValuesForInjection(filePath, frontmatter);
}

function checkFrontmatterValuesForInjection(filePath, obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      const hit = detectInjectionForm(value);
      if (hit) {
        throw new InjectionError(
          `Shell-injection form detected in frontmatter key '${key}' of '${filePath}': ${hit}`
        );
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          const hit = detectInjectionForm(item);
          if (hit) {
            throw new InjectionError(
              `Shell-injection form detected in frontmatter array '${key}' of '${filePath}': ${hit}`
            );
          }
        }
      }
    } else if (value !== null && typeof value === "object") {
      checkFrontmatterValuesForInjection(filePath, value);
    }
  }
}

// ---------------------------------------------------------------------------
// Format detection — structural primary, marker secondary
// ---------------------------------------------------------------------------

/**
 * Detect whether a file is in CC-canonical or opencode-projected format.
 *
 * Structural evidence (primary):
 *   - `permission` object present  => opencode
 *   - provider-prefixed `model` (e.g. "anthropic/...")  => opencode
 *   - `tools:` or `allowed-tools:` key with bare/alias model  => CC
 *
 * Round-trip marker (secondary — named frontmatter key `th-origin`, never body string):
 *   - Confirms structural finding; fails closed if it contradicts structure.
 *
 * Returns: "claude-code" | "opencode" | "unknown"
 */
function detectFormat(frontmatter, filePath) {
  const hasPermission = frontmatter["permission"] !== undefined && frontmatter["permission"] !== null;
  const model = frontmatter["model"];
  const hasProviderPrefix = typeof model === "string" && model.startsWith(ANTHROPIC_PREFIX);
  const hasToolsKey = frontmatter["tools"] !== undefined;
  const hasAllowedToolsKey = frontmatter["allowed-tools"] !== undefined;
  const hasBareModel = typeof model === "string" && !model.startsWith(ANTHROPIC_PREFIX);

  let structuralFormat = "unknown";
  if (hasPermission || hasProviderPrefix) {
    structuralFormat = "opencode";
  } else if (hasToolsKey || hasAllowedToolsKey) {
    structuralFormat = "claude-code";
  } else if (hasBareModel) {
    structuralFormat = "claude-code";
  }

  // Secondary: round-trip marker (named frontmatter key, never body string.includes).
  const marker = frontmatter["th-origin"];
  if (marker !== undefined && marker !== null) {
    const markerStr = String(marker);
    if (markerStr !== "claude-code" && markerStr !== "opencode") {
      throw new MarkerContradictionError(
        `'${filePath}': round-trip marker 'th-origin' has unrecognized value '${markerStr}'`
      );
    }
    if (structuralFormat !== "unknown" && markerStr !== structuralFormat) {
      throw new MarkerContradictionError(
        `'${filePath}': marker 'th-origin=${markerStr}' contradicts structural evidence (detected: ${structuralFormat}). Refusing to process.`
      );
    }
    return markerStr;
  }

  return structuralFormat;
}

/**
 * Classify a file as "agent" or "command" based on its path.
 */
function classifyFileSurface(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("/commands/")) return "command";
  if (normalized.includes("/agents/")) return "agent";
  return "agent";
}

// ---------------------------------------------------------------------------
// Model id transform
// ---------------------------------------------------------------------------

function toProviderPrefixedModel(bare) {
  if (!bare || typeof bare !== "string") return bare;
  if (bare.startsWith(ANTHROPIC_PREFIX)) return bare;
  return ANTHROPIC_PREFIX + bare;
}

function toBareModel(prefixed) {
  if (!prefixed || typeof prefixed !== "string") return prefixed;
  if (prefixed.startsWith(ANTHROPIC_PREFIX)) return prefixed.slice(ANTHROPIC_PREFIX.length);
  return prefixed;
}

// ---------------------------------------------------------------------------
// Tool permissions transform
// ---------------------------------------------------------------------------

/** CC agent `tools:` comma-separated string -> opencode `permission.allow` array. */
function agentToolsToPermissionAllow(toolsStr) {
  if (!toolsStr || typeof toolsStr !== "string") return [];
  return toolsStr.split(",").map((t) => t.trim()).filter(Boolean);
}

/** CC command `allowed-tools:` (string or array) -> opencode `permission.allow` array. */
function commandAllowedToolsToPermissionAllow(allowedTools) {
  if (!allowedTools) return [];
  if (Array.isArray(allowedTools)) return allowedTools.map(String).map((t) => t.trim()).filter(Boolean);
  if (typeof allowedTools === "string") {
    if (allowedTools.includes(",")) {
      return allowedTools.split(",").map((t) => t.trim()).filter(Boolean);
    }
    return allowedTools.split(/\s+/).filter(Boolean);
  }
  return [];
}

/** opencode `permission.allow` array -> CC agent `tools:` comma-string. */
function permissionAllowToAgentTools(allow) {
  if (!allow || !Array.isArray(allow)) return "";
  return allow.join(", ");
}

/** opencode `permission.allow` array -> CC command `allowed-tools:` space-string. */
function permissionAllowToCommandAllowedTools(allow) {
  if (!allow || !Array.isArray(allow)) return "";
  return allow.join(" ");
}

// ---------------------------------------------------------------------------
// Write-path containment gate (SEC-01 / SEC-02 / SEC-08 analogues)
// ---------------------------------------------------------------------------

function normalizeForPrefixCheck(p) {
  return p.replace(/\\/g, "/");
}

/**
 * Strict segment-prefix descendant check.
 * Uses normalized path segments (not string startsWith) to prevent the
 * "repo-root-evil/" bypass where a sibling dir matches as a prefix.
 */
function isStrictDescendant(candidate, ancestor) {
  const c = normalizeForPrefixCheck(candidate);
  const a = normalizeForPrefixCheck(ancestor);
  const prefix = a.endsWith("/") ? a : a + "/";
  return c.startsWith(prefix) && c.length > prefix.length;
}

/**
 * Validate a single output path for write-path containment (dry-run — no write).
 *
 * Checks:
 *   1. Reject residual ".." before resolution (SEC-08).
 *   2. Realpath the parent directory to resolve any symlinks.
 *   3. Assert strict descendant of repo root.
 *   4. Assert within the writable-prefix allowlist.
 *   5. Walk ALL components from repo root to the leaf with lstat — reject if any
 *      existing component is a symlink or Windows reparse point/junction (SEC-OCM-1).
 *      This closes the intermediate-component TOCTOU gap on all platforms:
 *      on POSIX lstat returns isSymbolicLink()=true for symlinks; on Windows,
 *      Node's lstat maps junctions and reparse points to isSymbolicLink()=true
 *      in modern Node versions (v18+). Any symlink/reparse found → fail-closed,
 *      no write for this file.
 *
 * Returns the canonicalized real output path for use in the write step.
 * Throws ContainmentError on any violation.
 *
 * Residual TOCTOU note: Node has no portable atomic openat-relative write.
 * A sub-millisecond race between the per-component lstat checks and the
 * subsequent open (in writeFileNoFollow) on an intermediate component
 * cannot be fully eliminated. This is accepted for a repo-local contributor tool.
 * This write pattern MUST NOT be promoted to a distributed/SEC-01 surface
 * without an atomic openat-based implementation.
 */
async function validateOutputPath(outputPath, repoRoot) {
  // SEC-08: reject residual ".." before any resolution.
  if (outputPath.includes("..")) {
    throw new ContainmentError(
      `SEC-08: path contains residual '..' traversal: '${outputPath}'`
    );
  }

  // Realpath the parent directory (file may not exist yet).
  const parentDir = path.dirname(outputPath);
  let realParent;
  try {
    realParent = await fs.realpath(parentDir);
  } catch {
    // Parent doesn't exist yet — use the resolved absolute path for the check.
    realParent = path.resolve(parentDir);
  }

  // Reconstruct the candidate real output path from real parent + basename.
  const realOutput = path.join(realParent, path.basename(outputPath));

  // Second ".." check post-resolution.
  if (realOutput.includes("..")) {
    throw new ContainmentError(
      `SEC-08: resolved path contains '..' after normalization: '${realOutput}'`
    );
  }

  // Strict descendant check vs repo root.
  if (!isStrictDescendant(realOutput, repoRoot)) {
    throw new ContainmentError(
      `SEC-01: output path '${realOutput}' is not a strict descendant of repo root '${repoRoot}'`
    );
  }

  // Writable-prefix allowlist (relative to repo root, segment-based).
  const relToRoot = path.relative(repoRoot, realOutput).replace(/\\/g, "/");
  const allowedByPrefix = WRITABLE_PREFIXES.some(
    (prefix) => relToRoot === prefix || relToRoot.startsWith(prefix + "/")
  );
  if (!allowedByPrefix) {
    throw new ContainmentError(
      `Write-path allowlist violation: '${relToRoot}' is not within any allowed prefix (${WRITABLE_PREFIXES.join(", ")})`
    );
  }

  // SEC-OCM-1: per-component lstat rejection — walk ALL components from the repo
  // root down to (and including) the leaf path. Reject fail-closed if any EXISTING
  // component is a symlink or Windows reparse point / junction.
  //
  // On POSIX: lstat().isSymbolicLink() catches symlinks (O_NOFOLLOW covers the leaf
  // at write time as belt-and-suspenders — see writeFileNoFollow).
  // On Windows: Node v18+ maps junctions and reparse points to isSymbolicLink()=true
  // via lstat, closing the gap where O_NOFOLLOW is 0 and provides no protection.
  // Non-existing components (not yet created) are allowed through — they will be
  // created by the per-segment mkdir in writeFileNoFollow.
  let walkPath = repoRoot;
  const relParts = path.relative(repoRoot, realOutput).split(path.sep);
  for (let i = 0; i < relParts.length; i++) {
    walkPath = path.join(walkPath, relParts[i]);
    let stat;
    try {
      stat = await fs.lstat(walkPath);
    } catch {
      // Component does not exist yet — stop walking; remaining segments will be
      // created fresh by writeFileNoFollow and cannot be symlinks at creation time.
      break;
    }
    if (stat.isSymbolicLink()) {
      throw new ContainmentError(
        `SEC-01: symlink/reparse detected at path component '${walkPath}' — refusing fail-closed to prevent symlink-follow write`
      );
    }
  }

  return realOutput;
}

/**
 * Create all missing directory segments for a validated real path, one segment
 * at a time. Each existing segment is lstat-verified to be a real directory
 * (not a symlink or reparse point) before descending into it.
 *
 * This replaces fs.mkdir({recursive:true}), which follows symlinks on the string
 * path and could materialise directories on the far side of an intermediate symlink
 * (SEC-OCM-3). Per-segment creation ensures we only ever create segments that did
 * not exist at validation time — and any segment that appears between validation
 * and creation that is a symlink is rejected fail-closed.
 */
async function mkdirPerSegment(dirPath) {
  const { root: fsRoot } = path.parse(dirPath);
  const segments = [];
  let cur = dirPath;
  while (cur !== fsRoot && cur !== path.dirname(cur)) {
    segments.unshift(cur);
    cur = path.dirname(cur);
  }

  for (const seg of segments) {
    let stat;
    try {
      stat = await fs.lstat(seg);
    } catch {
      // Segment does not exist — create it (non-recursive, single level).
      await fs.mkdir(seg);
      continue;
    }
    // Segment exists: must be a real directory, not a symlink or reparse point.
    if (stat.isSymbolicLink()) {
      throw new ContainmentError(
        `SEC-OCM-3: symlink/reparse detected at directory segment '${seg}' during mkdir — refusing fail-closed`
      );
    }
    if (!stat.isDirectory()) {
      throw new ContainmentError(
        `SEC-OCM-3: path segment '${seg}' exists but is not a directory — refusing fail-closed`
      );
    }
    // Segment is a real directory — descend into it.
  }
}

/**
 * Write a file through an O_NOFOLLOW handle on the validated real path.
 *
 * Directory creation uses per-segment mkdir (not recursive) to avoid following
 * symlinks while materialising the directory tree (SEC-OCM-3).
 *
 * O_NOFOLLOW provides leaf-level protection on POSIX as belt-and-suspenders
 * after the per-component lstat checks in validateOutputPath. On Windows,
 * O_NOFOLLOW is 0 (unavailable); protection on Windows relies entirely on
 * the per-component lstat rejection in validateOutputPath and mkdirPerSegment.
 *
 * Residual TOCTOU: a sub-millisecond race between validation and the fs.open
 * call cannot be fully closed without an atomic openat-based implementation,
 * which Node does not provide portably. Accepted for a repo-local tool.
 */
async function writeFileNoFollow(realPath, content) {
  await mkdirPerSegment(path.dirname(realPath));

  const O_WRONLY = fsConstants.O_WRONLY;
  const O_CREAT = fsConstants.O_CREAT;
  const O_TRUNC = fsConstants.O_TRUNC;
  // O_NOFOLLOW is POSIX-only; fallback to 0 on Windows where it is undefined.
  // Belt-and-suspenders for the leaf on POSIX; validateOutputPath lstat-checks
  // cover the Windows case.
  const O_NOFOLLOW = fsConstants.O_NOFOLLOW || 0;

  const flags = O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW;
  let fh;
  try {
    fh = await fs.open(realPath, flags, 0o666);
    await fh.writeFile(content, "utf8");
  } finally {
    if (fh) await fh.close();
  }
}

// ---------------------------------------------------------------------------
// Forward transform: CC -> opencode
// ---------------------------------------------------------------------------

/**
 * Transform a single CC file (agent or command) to its opencode projection.
 * Returns { outputPath, content, surface }.
 * Named-key allowlist only — no spread/merge of the parsed frontmatter object.
 */
function transformToOpencode(filePath, content, repoRoot) {
  const { frontmatter: fm, body } = parseFrontmatter(content);
  rejectPollutionKeys(fm);
  assertNoInjection(filePath, fm, body);

  const surface = classifyFileSurface(filePath);
  const basename = path.basename(filePath);
  const outputPath = path.join(
    repoRoot,
    ".opencode",
    surface === "agent" ? "agents" : "commands",
    basename
  );

  const projected = {};

  if (surface === "agent") {
    if (fm["name"] !== undefined) projected["name"] = fm["name"];
    if (fm["description"] !== undefined) projected["description"] = fm["description"];
    if (fm["model"] !== undefined) projected["model"] = toProviderPrefixedModel(String(fm["model"]));
    const toolsVal = fm["tools"];
    projected["permission"] = {
      allow: agentToolsToPermissionAllow(typeof toolsVal === "string" ? toolsVal : ""),
      ask: [],
      deny: [],
    };
    projected["mode"] = "subagent";
    if (fm["color"] !== undefined) projected["color"] = fm["color"];
  } else {
    if (fm["name"] !== undefined) projected["name"] = fm["name"];
    if (fm["description"] !== undefined) projected["description"] = fm["description"];
    if (fm["model"] !== undefined) projected["model"] = toProviderPrefixedModel(String(fm["model"]));
    const allowedTools = fm["allowed-tools"];
    const allowArr = commandAllowedToolsToPermissionAllow(allowedTools);
    if (allowArr.length > 0 || allowedTools !== undefined) {
      projected["permission"] = { allow: allowArr, ask: [], deny: [] };
    }
    // argument-hint has no opencode equivalent — not carried forward.
    if (fm["agent"] !== undefined) projected["agent"] = fm["agent"];
  }

  // Round-trip marker: records the CURRENT format of the projected file.
  // Value "opencode" confirms the file is now in opencode format (consistent with structural evidence).
  // This enables the inverse pass to confirm structural detection.
  projected["th-origin"] = "opencode";

  return { outputPath, content: serializeFrontmatter(projected, body), surface };
}

// ---------------------------------------------------------------------------
// Inverse transform: opencode -> CC
// ---------------------------------------------------------------------------

/**
 * Transform a single opencode file (agent or command) back to CC canonical form.
 * Returns { outputPath, content, surface, lossy }.
 * lossy is set when ask/deny arrays cannot be represented in CC form.
 */
function transformToCC(filePath, content, repoRoot) {
  const { frontmatter: fm, body } = parseFrontmatter(content);
  rejectPollutionKeys(fm);
  assertNoInjection(filePath, fm, body);

  const surface = classifyFileSurface(filePath);
  const basename = path.basename(filePath);
  const outputPath = surface === "agent"
    ? path.join(repoRoot, "agents", basename)
    : path.join(repoRoot, ".claude", "commands", basename);

  const permission = fm["permission"];
  const ask = (permission && Array.isArray(permission["ask"])) ? permission["ask"] : [];
  const deny = (permission && Array.isArray(permission["deny"])) ? permission["deny"] : [];
  const allow = (permission && Array.isArray(permission["allow"])) ? permission["allow"] : [];

  const lossy = (ask.length > 0 || deny.length > 0)
    ? `ask/deny dropped (ask: [${ask.join(", ")}], deny: [${deny.join(", ")}])`
    : null;

  const projected = {};

  if (surface === "agent") {
    if (fm["name"] !== undefined) projected["name"] = fm["name"];
    if (fm["description"] !== undefined) projected["description"] = fm["description"];
    if (fm["model"] !== undefined) projected["model"] = toBareModel(String(fm["model"]));
    projected["tools"] = permissionAllowToAgentTools(allow);
    if (fm["color"] !== undefined) projected["color"] = fm["color"];
    // mode: drop ONLY when it was injected by the forward pass (one of the known injected values).
    // A mode carrying any other value is preserved.
    const modeVal = fm["mode"];
    if (modeVal !== undefined && !INJECTED_MODE_VALUES.has(String(modeVal))) {
      projected["mode"] = modeVal;
    }
  } else {
    if (fm["name"] !== undefined) projected["name"] = fm["name"];
    if (fm["description"] !== undefined) projected["description"] = fm["description"];
    if (fm["model"] !== undefined) projected["model"] = toBareModel(String(fm["model"]));
    if (allow.length > 0 || permission !== undefined) {
      projected["allowed-tools"] = permissionAllowToCommandAllowedTools(allow);
    }
    if (fm["agent"] !== undefined) projected["agent"] = fm["agent"];
    // argument-hint cannot be recovered (not carried by forward pass).
  }

  // Do NOT carry the th-origin marker back to the CC file — it is a projection artifact.

  return { outputPath, content: serializeFrontmatter(projected, body), surface, lossy };
}

// ---------------------------------------------------------------------------
// Source file discovery
// ---------------------------------------------------------------------------

async function discoverCCFiles(repoRoot) {
  const files = [];

  // agents/*.md — exclude README.md and _shared/ subdirs
  const agentsDir = path.join(repoRoot, "agents");
  try {
    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
        files.push(path.join(agentsDir, entry.name));
      }
    }
  } catch {
    // agents/ may not exist in test scenarios
  }

  // .claude/commands/*.md
  const commandsDir = path.join(repoRoot, ".claude", "commands");
  try {
    const entries = await fs.readdir(commandsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(path.join(commandsDir, entry.name));
      }
    }
  } catch {
    // .claude/commands/ may not exist yet
  }

  return files;
}

async function discoverOpencodeFiles(repoRoot) {
  const files = [];

  for (const subdir of ["agents", "commands"]) {
    const dir = path.join(repoRoot, ".opencode", subdir);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          files.push(path.join(dir, entry.name));
        }
      }
    } catch {
      // .opencode/{agents,commands}/ may not exist yet
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Idempotency helper
// ---------------------------------------------------------------------------

async function isAlreadyIdentical(outputPath, newContent) {
  try {
    const existing = await fs.readFile(outputPath, "utf8");
    return existing === newContent;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main batch transform
// ---------------------------------------------------------------------------

/**
 * Run the full batch transform.
 *
 * Phase 1 (dry-run): transform all files; validate all output paths for containment.
 *   Any containment failure aborts the entire batch with zero writes.
 * Phase 2 (write): write validated files through O_NOFOLLOW handles.
 *
 * Returns manifest array of { source, output, status, lossy?, reason? }.
 * Manifest statuses: "projected" | "skipped (idempotent)" | "rejected" |
 *   "rejected (containment)" | "aborted (batch fail-closed)" | "write-error"
 */
async function runTransform(direction, repoRoot, options = {}) {
  const { dryRun = false } = options;

  const sourceFiles =
    direction === DIRECTION_TO_OPENCODE
      ? await discoverCCFiles(repoRoot)
      : await discoverOpencodeFiles(repoRoot);

  if (sourceFiles.length === 0) {
    return [];
  }

  const batch = [];

  for (const srcPath of sourceFiles) {
    // Read source file.
    let content;
    try {
      content = await fs.readFile(srcPath, "utf8");
    } catch (err) {
      batch.push({ source: srcPath, output: null, status: "rejected", reason: `Cannot read: ${err.message}` });
      continue;
    }

    // Parse and validate frontmatter.
    let parsed;
    try {
      parsed = parseFrontmatter(content);
      rejectPollutionKeys(parsed.frontmatter);
    } catch (err) {
      batch.push({ source: srcPath, output: null, status: "rejected", reason: `Frontmatter error: ${err.message}` });
      continue;
    }

    // Idempotency: if already in target format, skip.
    let currentFormat;
    try {
      currentFormat = detectFormat(parsed.frontmatter, srcPath);
    } catch (err) {
      batch.push({ source: srcPath, output: null, status: "rejected", reason: err.message });
      continue;
    }

    const targetFormat = direction === DIRECTION_TO_OPENCODE ? "opencode" : "claude-code";
    if (currentFormat === targetFormat) {
      const surface = classifyFileSurface(srcPath);
      const basename = path.basename(srcPath);
      const skippedOut = direction === DIRECTION_TO_OPENCODE
        ? path.join(repoRoot, ".opencode", surface === "agent" ? "agents" : "commands", basename)
        : path.join(repoRoot, surface === "agent" ? "agents" : path.join(".claude", "commands"), basename);
      batch.push({ source: srcPath, output: skippedOut, status: "skipped (idempotent)", reason: `Already in ${targetFormat} format` });
      continue;
    }

    // Run the transform.
    let transformed;
    try {
      transformed = direction === DIRECTION_TO_OPENCODE
        ? transformToOpencode(srcPath, content, repoRoot)
        : transformToCC(srcPath, content, repoRoot);
    } catch (err) {
      batch.push({ source: srcPath, output: null, status: "rejected", reason: err.message });
      continue;
    }

    // Validate output path (containment dry-run).
    let realOutputPath;
    try {
      realOutputPath = await validateOutputPath(transformed.outputPath, repoRoot);
    } catch (err) {
      batch.push({ source: srcPath, output: transformed.outputPath, status: "rejected (containment)", reason: err.message });
      continue;
    }

    batch.push({
      source: srcPath,
      output: realOutputPath,
      content: transformed.content,
      status: "projected",
      lossy: transformed.lossy || null,
    });
  }

  // Batch fail-closed: any containment rejection aborts all writes.
  const hasRejections = batch.some((item) => item.status.startsWith("rejected"));
  if (hasRejections && !dryRun) {
    return batch.map((item) =>
      item.status === "projected"
        ? { ...item, status: "aborted (batch fail-closed)", content: undefined }
        : item
    );
  }

  if (dryRun) return batch;

  // Phase 2: write through O_NOFOLLOW handles.
  const result = [];
  for (const item of batch) {
    if (item.status !== "projected") {
      result.push(item);
      continue;
    }
    try {
      await writeFileNoFollow(item.output, item.content);
      result.push({ ...item, content: undefined });
    } catch (err) {
      result.push({ ...item, status: "write-error", reason: err.message, content: undefined });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API (for testing)
// ---------------------------------------------------------------------------

export {
  parseFrontmatter,
  serializeFrontmatter,
  detectFormat,
  detectInjectionForm,
  assertNoInjection,
  rejectPollutionKeys,
  transformToOpencode,
  transformToCC,
  validateOutputPath,
  mkdirPerSegment,
  runTransform,
  getRepoRoot,
  DIRECTION_TO_OPENCODE,
  DIRECTION_TO_CC,
  ContainmentError,
  InjectionError,
  MarkerContradictionError,
  classifyFileSurface,
  agentToolsToPermissionAllow,
  commandAllowedToolsToPermissionAllow,
  permissionAllowToAgentTools,
  permissionAllowToCommandAllowedTools,
  toProviderPrefixedModel,
  toBareModel,
  isAlreadyIdentical,
  WRITABLE_PREFIXES,
};

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

async function main() {
  const direction = process.argv[2];
  if (direction !== DIRECTION_TO_OPENCODE && direction !== DIRECTION_TO_CC) {
    console.error(`Usage: node tools/harness-migrate/migrate.mjs <${DIRECTION_TO_OPENCODE}|${DIRECTION_TO_CC}>`);
    process.exit(1);
  }

  let repoRoot;
  try {
    repoRoot = await getRepoRoot();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  console.log(`Direction: ${direction}`);
  console.log(`Repo root: ${repoRoot}`);
  console.log("");

  let manifest;
  try {
    manifest = await runTransform(direction, repoRoot);
  } catch (err) {
    console.error(`Transform error: ${err.message}`);
    process.exit(1);
  }

  const projected = manifest.filter((m) => m.status === "projected");
  const skipped = manifest.filter((m) => m.status.startsWith("skipped"));
  const rejected = manifest.filter((m) => m.status.startsWith("rejected"));
  const aborted = manifest.filter((m) => m.status.startsWith("aborted"));
  const lossy = manifest.filter((m) => m.lossy);

  console.log("--- Projected-file manifest ---");
  for (const item of manifest) {
    const lossyNote = item.lossy ? ` [LOSSY: ${item.lossy}]` : "";
    console.log(`  [${item.status.toUpperCase()}] ${item.source} -> ${item.output || "(none)"}${lossyNote}`);
    if (item.reason) console.log(`    reason: ${item.reason}`);
  }
  console.log("");
  console.log(`Summary: ${projected.length} projected, ${skipped.length} skipped (idempotent), ${rejected.length} rejected, ${aborted.length} aborted`);
  if (lossy.length > 0) {
    console.log(`Warning: ${lossy.length} file(s) had lossy inverse (ask/deny dropped) — review the manifest above.`);
  }

  if (rejected.length > 0 || aborted.length > 0) {
    process.exit(1);
  }
}

// Run main only when executed directly (not imported as a module).
const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(url.fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}
