#!/usr/bin/env node
/** Resolve and discover the single canonical Team Harness workspace identity. */

import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { isDirectExecution } from "./cli-entrypoint.mjs";

export const WORKSPACE_IDENTITY_SCHEMA_VERSION = 1;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ROLE = new Set(["writable-owner", "evidence-only"]);
const MAX_IDENTITY_BYTES = 64 * 1024;

const safeString = (value, maximum = 4096) => typeof value === "string" && value.length > 0
  && !value.includes("\0") && Buffer.byteLength(value, "utf8") <= maximum;

function contained(root, target, allowEqual = false) {
  const relative = path.relative(root, target);
  return (allowEqual && relative === "")
    || (relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function normalizeSubfolder(value) {
  if (!safeString(value, 1024) || path.isAbsolute(value) || value.includes("\\")) throw new Error("logs-subfolder invalid");
  const parts = value.split("/");
  if (parts.some(part => part === "" || part === "." || part === ".." || /[*?[\]{}]/.test(part))) {
    throw new Error("logs-subfolder invalid");
  }
  return parts.join(path.sep);
}

async function canonicalDirectory(value, label) {
  if (!safeString(value) || !path.isAbsolute(value)) throw new Error(`${label} must be absolute`);
  const requested = path.resolve(value);
  if (requested === path.parse(requested).root) throw new Error(`${label} must not be a filesystem root`);
  const stat = await lstat(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a non-symlink directory`);
  const canonical = await realpath(requested);
  return canonical;
}

function commonParent(values) {
  const parents = values.map(value => path.dirname(value));
  if (!parents.every(value => value === parents[0])) throw new Error("initiative repositories must be siblings");
  return parents[0];
}

function normalizeRepositories(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("repositories required");
  const seenServices = new Set();
  const seenRoots = new Set();
  return values.map(value => {
    if (!value || typeof value !== "object" || !SLUG.test(value.service ?? "") || !ROLE.has(value.role)
      || !safeString(value.root) || !path.isAbsolute(value.root) || !safeString(value.identity, 1024)) {
      throw new Error("repository binding invalid");
    }
    const root = path.resolve(value.root);
    if (seenServices.has(value.service) || seenRoots.has(root)) throw new Error("repository binding duplicate");
    seenServices.add(value.service);
    seenRoots.add(root);
    return { service: value.service, root, identity: value.identity, role: value.role };
  });
}

export function isWorkspaceIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schema_version !== WORKSPACE_IDENTITY_SCHEMA_VERSION
    || value.kind !== "team_harness_workspace_identity"
    || !["single", "initiative"].includes(value.workspace_kind)
    || !["local", "obsidian"].includes(value.logs_mode)
    || !safeString(value.coordinator_root) || !path.isAbsolute(value.coordinator_root)
    || !safeString(value.repo_base, 255) || !DATE.test(value.date)
    || (value.feature !== null && !SLUG.test(value.feature))
    || (value.initiative !== null && !SLUG.test(value.initiative))
    || !Array.isArray(value.services) || !Array.isArray(value.evidence_repositories)) return false;
  if (value.workspace_kind === "single" ? value.feature === null || value.initiative !== null : value.initiative === null || value.feature !== null) return false;
  if (value.workspace_kind === "single" ? value.services.length !== 1 : value.services.length < 2) return false;
  const entries = [...value.services, ...value.evidence_repositories];
  if (entries.some(entry => !entry || !SLUG.test(entry.service ?? "") || !safeString(entry.root)
    || !path.isAbsolute(entry.root) || !safeString(entry.identity, 1024)
    || (value.services.includes(entry) ? entry.role !== "writable-owner" : entry.role !== "evidence-only"))) return false;
  const serviceNames = entries.map(entry => entry.service);
  const roots = entries.map(entry => path.resolve(entry.root));
  if (new Set(serviceNames).size !== serviceNames.length || new Set(roots).size !== roots.length) return false;
  return value.services.every(entry => safeString(entry.workspace) && path.isAbsolute(entry.workspace)
    && contained(path.resolve(value.coordinator_root), path.resolve(entry.workspace), value.workspace_kind === "single"));
}

export async function resolveWorkspaceIdentity({
  logsMode = "local",
  logsPath = null,
  logsSubfolder = "work-logs",
  repositories,
  feature = null,
  initiative = null,
  date,
  persistedIdentity = null,
} = {}) {
  if (persistedIdentity !== null) {
    if (!isWorkspaceIdentity(persistedIdentity)) throw new Error("persisted workspace identity invalid");
    return structuredClone(persistedIdentity);
  }
  if (!["local", "obsidian"].includes(logsMode) || !DATE.test(date ?? "")) throw new Error("workspace arguments invalid");
  const bindings = normalizeRepositories(repositories);
  const writable = bindings.filter(entry => entry.role === "writable-owner");
  const evidence = bindings.filter(entry => entry.role === "evidence-only");
  const initiativeMode = initiative !== null;
  if (initiativeMode ? !SLUG.test(initiative) || feature !== null || writable.length < 2 : !SLUG.test(feature ?? "") || writable.length !== 1) {
    throw new Error("workspace shape invalid");
  }
  const canonicalWritable = [];
  for (const entry of writable) canonicalWritable.push({ ...entry, root: await canonicalDirectory(entry.root, `${entry.service} repository`) });
  const canonicalEvidence = [];
  for (const entry of evidence) canonicalEvidence.push({ ...entry, root: await canonicalDirectory(entry.root, `${entry.service} evidence repository`) });
  const repositoryBase = initiativeMode ? commonParent(canonicalWritable.map(entry => entry.root)) : path.dirname(canonicalWritable[0].root);
  const repoBase = path.basename(repositoryBase);
  const leaf = `${date}_${initiativeMode ? initiative : feature}`;
  let coordinatorRoot;
  if (logsMode === "obsidian") {
    const configuredRoot = await canonicalDirectory(logsPath, "logs-path");
    const subfolder = normalizeSubfolder(logsSubfolder);
    const worklogsRoot = path.resolve(configuredRoot, subfolder);
    if (!contained(configuredRoot, worklogsRoot)) throw new Error("worklogs root escapes logs-path");
    coordinatorRoot = initiativeMode
      ? path.join(worklogsRoot, repoBase, leaf)
      : path.join(worklogsRoot, path.basename(canonicalWritable[0].root), leaf);
  } else {
    coordinatorRoot = initiativeMode
      ? path.join(repositoryBase, leaf)
      : path.join(canonicalWritable[0].root, "workspaces", leaf);
  }
  const services = canonicalWritable.map(entry => ({
    ...entry,
    workspace: initiativeMode ? path.join(coordinatorRoot, entry.service) : coordinatorRoot,
  }));
  const identity = {
    schema_version: WORKSPACE_IDENTITY_SCHEMA_VERSION,
    kind: "team_harness_workspace_identity",
    workspace_kind: initiativeMode ? "initiative" : "single",
    logs_mode: logsMode,
    coordinator_root: coordinatorRoot,
    repo_base: repoBase,
    date,
    feature: initiativeMode ? null : feature,
    initiative: initiativeMode ? initiative : null,
    services,
    evidence_repositories: canonicalEvidence,
  };
  if (!isWorkspaceIdentity(identity)) throw new Error("resolved workspace identity invalid");
  return identity;
}

function sameRepositoryIdentities(identity, expected) {
  const actual = [...identity.services, ...identity.evidence_repositories]
    .map(entry => `${entry.role}\0${entry.service}\0${entry.identity}`).sort();
  const wanted = expected.map(entry => `${entry.role}\0${entry.service}\0${entry.identity}`).sort();
  return JSON.stringify(actual) === JSON.stringify(wanted);
}

export async function discoverWorkspaceIdentity({ searchRoot, slug, repositoryIdentities } = {}) {
  if (!SLUG.test(slug ?? "") || !Array.isArray(repositoryIdentities)) return { status: "invalid", identity: null, candidates: [] };
  let root;
  try { root = await canonicalDirectory(searchRoot, "search root"); }
  catch { return { status: "invalid", identity: null, candidates: [] }; }
  let dirents;
  try { dirents = await readdir(root, { withFileTypes: true }); }
  catch { return { status: "invalid", identity: null, candidates: [] }; }
  const matches = [];
  for (const entry of dirents) {
    if (!entry.isDirectory() || !new RegExp(`^\\d{4}-\\d{2}-\\d{2}_${slug}$`).test(entry.name)) continue;
    const candidateRoot = path.join(root, entry.name);
    const identityPath = path.join(candidateRoot, "inputs", "workspace-identity.json");
    try {
      const stat = await lstat(identityPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_IDENTITY_BYTES) continue;
      const identity = JSON.parse(await readFile(identityPath, "utf8"));
      if (isWorkspaceIdentity(identity) && path.resolve(identity.coordinator_root) === candidateRoot
        && sameRepositoryIdentities(identity, repositoryIdentities)) matches.push(identity);
    } catch { /* Candidate is not a verified workspace identity. */ }
  }
  if (matches.length === 1) return { status: "found", identity: matches[0], candidates: [matches[0].coordinator_root] };
  return { status: matches.length === 0 ? "not-found" : "ambiguous", identity: null, candidates: matches.map(value => value.coordinator_root).sort() };
}

if (isDirectExecution(import.meta.url)) {
  process.stderr.write("workspace-identity.mjs is a library helper; Team Harness supplies verified inputs.\n");
  process.exitCode = 2;
}
