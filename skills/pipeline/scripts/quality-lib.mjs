#!/usr/bin/env node
/**
 * Shared helpers for the quality-stack scripts.
 *
 * One implementation of hashing, closed-shape checks, path validation, bounded
 * JSON reading, bounded git access, ls-tree parsing, and path-rule matching.
 * Helpers that raise are parameterized with the caller's error factory so each
 * entry point keeps its own closed error taxonomy.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MAX_JSON_BYTES = 1024 * 1024;
export const SAFE_GIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

const GIT_TIMEOUT_DEFAULT_MS = 30_000;
const GIT_TIMEOUT_MIN_MS = 5_000;
const GIT_TIMEOUT_MAX_MS = 600_000;

export const MAX_DETAIL_CHARS = 200;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Collapse a diagnostic string to one bounded printable line, or null. */
export function boundedDetail(value) {
  if (typeof value !== "string") return null;
  const singleLine = value.replaceAll(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (singleLine.length === 0) return null;
  return singleLine.length > MAX_DETAIL_CHARS ? singleLine.slice(0, MAX_DETAIL_CHARS) : singleLine;
}

export function isBoundedDetail(value) {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= MAX_DETAIL_CHARS &&
      !/[\u0000-\u001f\u007f]/.test(value))
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

/** Content identity of a JSON document: parse-order and formatting independent. */
export function canonicalHash(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

export function hasOnlyKeys(value, allowed, required = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.every((key) => allowed.includes(key)) && required.every((key) => Object.hasOwn(value, key));
}

export function hasExactlyKeys(value, keys) {
  return hasOnlyKeys(value, keys, keys) && Object.keys(value).length === keys.length;
}

export function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\u0000") || path.isAbsolute(value)) {
    return false;
  }
  const normalized = value.replaceAll("\\", "/");
  return (
    !normalized.startsWith("/") &&
    !normalized.split("/").includes("..") &&
    Buffer.byteLength(value, "utf8") <= 512
  );
}

export function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function pathMatchesRule(candidate, rule) {
  const normalized = candidate.replaceAll("\\", "/");
  if (rule.type === "prefix") return normalized.startsWith(rule.value.replaceAll("\\", "/"));
  if (rule.type === "suffix") return normalized.endsWith(rule.value);
  return normalized.split("/").includes(rule.value);
}

export function resolveGitTimeoutMs(env = process.env) {
  const raw = env.TH_GIT_TIMEOUT_MS;
  if (typeof raw !== "string" || !/^\d{1,7}$/.test(raw)) return GIT_TIMEOUT_DEFAULT_MS;
  return Math.min(GIT_TIMEOUT_MAX_MS, Math.max(GIT_TIMEOUT_MIN_MS, Number(raw)));
}

export function createBoundedJsonReader(makeError) {
  return async function readBoundedJson(filePath, code, detail = null) {
    try {
      const stat = await lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JSON_BYTES) throw new Error("invalid file");
      const bytes = await readFile(filePath);
      if (bytes.length > MAX_JSON_BYTES) throw new Error("file too large");
      return { value: JSON.parse(bytes.toString("utf8")), bytes };
    } catch {
      throw makeError(code, detail);
    }
  };
}

export function createGitRunners(makeError) {
  async function gitBytes(repo, args, code) {
    const timeoutMs = resolveGitTimeoutMs();
    try {
      const result = await execFileAsync("git", args, {
        cwd: repo,
        encoding: null,
        maxBuffer: MAX_JSON_BYTES,
        timeout: timeoutMs,
        windowsHide: true,
      });
      return result.stdout;
    } catch (error) {
      const operation = typeof args?.[0] === "string" ? args[0] : "command";
      if (error?.killed === true && error?.signal === "SIGTERM") {
        throw makeError(code, `git ${operation} timed out after ${timeoutMs}ms`);
      }
      throw makeError(code, `git ${operation} failed`);
    }
  }
  async function gitText(repo, args, code) {
    return (await gitBytes(repo, args, code)).toString("utf8").trim();
  }
  return { gitText, gitBytes };
}

export function createBlobResolver(gitBytes, makeError) {
  return async function resolveBlobsAtCommit(repo, commit, paths, code) {
    if (paths.length === 0) return new Map();
    const bytes = await gitBytes(repo, ["ls-tree", "-z", "--full-tree", commit, "--", ...paths], code);
    const requested = new Set(paths);
    const blobs = new Map();
    for (const record of bytes.toString("utf8").split("\u0000").filter(Boolean)) {
      const separator = record.indexOf("\t");
      const [mode, type, object, ...extra] = record.slice(0, separator).split(" ");
      const candidate = record.slice(separator + 1);
      if (
        separator < 0 || extra.length !== 0 || !/^[0-7]{6}$/.test(mode) || type !== "blob" ||
        !SAFE_GIT_ID.test(object) || !requested.has(candidate) || blobs.has(candidate)
      ) {
        throw makeError(code, "git ls-tree returned an unexpected record");
      }
      blobs.set(candidate, object);
    }
    if (blobs.size !== requested.size) throw makeError(code, "git ls-tree did not return every requested path");
    return blobs;
  };
}
