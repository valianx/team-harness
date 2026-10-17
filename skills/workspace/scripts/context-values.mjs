import path from "node:path";

/** isRecord excludes arrays from supplied metadata records. */
export const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

/** safeText bounds retained metadata and excludes control characters. */
export const safeText = (value, maximum = 4096) => typeof value === "string" && value.trim() === value
  && value.length > 0 && Buffer.byteLength(value, "utf8") <= maximum && !/[\x00-\x1f\x7f]/.test(value);

/** isOpaqueId keeps provider identifiers out of filesystem and URL coordinates. */
export const isOpaqueId = value => safeText(value, 512) && !/[\s/\\:]/.test(value) && value !== "." && value !== "..";

/** isFileDirectory checks lexical scope; callers retain physical containment and access checks. */
export function isFileDirectory(value) {
  return safeText(value) && path.isAbsolute(value) && path.resolve(value) !== path.parse(path.resolve(value)).root
    && !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value);
}

function isPortableHostDirectory(value) {
  if (!safeText(value)) return false;
  const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(value)
    || /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(value);
  const syntax = windowsAbsolute ? path.win32 : path.posix;
  if (!syntax.isAbsolute(value)) return false;
  const normalized = syntax.normalize(value);
  return normalized !== syntax.parse(normalized).root;
}

function sourceReference(value) {
  if (!safeText(value)) throw new Error("source reference invalid");
  const prefix = value.match(/^(?:origin:)+/i)?.[0] ?? "";
  const reference = value.slice(prefix.length);
  try {
    const parsed = new URL(reference);
    if (parsed.hostname) {
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      return `${prefix}${parsed.href}`;
    }
  } catch { /* Portable opaque identities need not be URLs. */ }
  return `${prefix}${reference.replace(/^[^/@:]+@(?=[^/:]+:)/, "")}`;
}

function portableIdentity(value) {
  if (!safeText(value, 1024)) throw new Error("source identity invalid");
  const reference = value.replace(/^(?:origin:)+/i, "");
  if (!safeText(reference, 1024) || path.posix.isAbsolute(reference) || path.win32.isAbsolute(reference)
    || /^(?:[A-Za-z]:|file:)/i.test(reference)) {
    throw new Error("source identity invalid");
  }
  return sourceReference(value);
}

/** normalizeSourceAssociations retains verified portable identities separately from host paths. */
export function normalizeSourceAssociations(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 128) throw new Error("source associations required");
  const identities = new Set();
  const result = values.map(value => {
    if (!isRecord(value) || !["repository", "projectless"].includes(value.kind)
      || !["writable-owner", "evidence-only"].includes(value.role) || value.verified !== true
      || (value.kind === "projectless" && value.role !== "writable-owner")) throw new Error("source association unverified");
    const normalized = { ...structuredClone(value), identity: portableIdentity(value.identity) };
    const key = `${value.kind}\0${normalized.identity}`;
    if (identities.has(key)) throw new Error("source association duplicate");
    identities.add(key);
    if (value.canonical_source !== undefined) normalized.canonical_source = sourceReference(value.canonical_source);
    if (value.host_paths !== undefined) {
      if (!Array.isArray(value.host_paths) || value.host_paths.some(mapping => !isRecord(mapping)
        || !safeText(mapping.host, 255) || !isPortableHostDirectory(mapping.path))) throw new Error("host mapping invalid");
    }
    if (value.aliases !== undefined) {
      if (!Array.isArray(value.aliases)) throw new Error("source aliases invalid");
      normalized.aliases = value.aliases.map(alias => {
        if (!isRecord(alias) || alias.verified !== true || !safeText(alias.evidence)) throw new Error("source alias unverified");
        return { ...structuredClone(alias), identity: portableIdentity(alias.identity), evidence: sourceReference(alias.evidence) };
      });
    }
    return normalized;
  });
  if (!result.some(value => value.role === "writable-owner")) throw new Error("owning source required");
  return result;
}

/** sameOwningSources matches verified identity or alias evidence without using host paths or evidence-only sources. */
export function sameOwningSources(first, second) {
  const left = normalizeSourceAssociations(first).filter(value => value.role === "writable-owner");
  const right = normalizeSourceAssociations(second).filter(value => value.role === "writable-owner");
  const matches = (a, b) => a.kind === b.kind && (a.identity === b.identity
    || a.aliases?.some(alias => alias.identity === b.identity)
    || b.aliases?.some(alias => alias.identity === a.identity));
  return left.length === right.length && left.every(value => right.filter(candidate => matches(value, candidate)).length === 1)
    && right.every(value => left.filter(candidate => matches(value, candidate)).length === 1);
}
