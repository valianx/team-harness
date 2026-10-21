import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = value => typeof value === "string" && value.trim().length > 0;
const isId = value => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
const isPointer = value => typeof value === "string" && /^(?:\/(?:[^~]|~[01])*)*$/.test(value);
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** Return structural and dependency errors without executing or resolving batch data. */
export function validateBatch(batch) {
  const errors = [];
  const fail = (at, reason) => errors.push(`${at}: ${reason}`);
  function record(value, at, fields) {
    if (!isRecord(value)) { fail(at, "expected an object"); return false; }
    for (const key of Object.keys(value)) {
      if (!fields.includes(key)) fail(`${at}[${JSON.stringify(key)}]`, "unknown field");
    }
    return true;
  }
  function text(value, at, identifier = false) {
    if (!(identifier ? isId(value) : isText(value))) {
      fail(at, identifier ? "expected a lowercase identifier of at most 64 characters" : "expected a nonempty string");
    }
  }
  function pointers(value, at) {
    if (!Array.isArray(value)) { fail(at, "expected an array of JSON pointers"); return; }
    value.forEach((pointer, index) => {
      if (!isPointer(pointer)) fail(`${at}[${index}]`, "expected a JSON pointer");
    });
  }

  if (!record(batch, "batch", ["schemaVersion", "id", "name", "cases"])) return errors;
  if (batch.schemaVersion !== 1) fail("batch.schemaVersion", "expected version 1");
  text(batch.id, "batch.id", true);
  text(batch.name, "batch.name");
  if (!Array.isArray(batch.cases) || batch.cases.length === 0) {
    fail("batch.cases", "expected a nonempty array");
    return errors;
  }
  const ids = new Map();
  batch.cases.forEach((item, index) => {
    const at = `batch.cases[${index}]`;
    const common = ["id", "name", "flow", "service", "type", "dependsOn", "timeoutMs"];
    const specific = item?.type === "api" ? ["request", "expect"] : ["runner", "test"];
    if (!record(item, at, [...common, ...specific])) return;
    text(item.id, `${at}.id`, true);
    for (const field of ["name", "flow"]) text(item[field], `${at}.${field}`);
    text(item.service, `${at}.service`, true);
    if (isId(item.id)) {
      if (ids.has(item.id)) fail(`${at}.id`, "duplicate case identity");
      else ids.set(item.id, item);
    }
    if (item.timeoutMs !== undefined && (!Number.isSafeInteger(item.timeoutMs) || item.timeoutMs <= 0)) {
      fail(`${at}.timeoutMs`, "expected a positive integer");
    }
    if (item.dependsOn !== undefined) {
      if (!Array.isArray(item.dependsOn)) fail(`${at}.dependsOn`, "expected an array of case identifiers");
      else {
        const seen = new Set();
        item.dependsOn.forEach((id, dependencyIndex) => {
          if (!isId(id) || id === item.id || seen.has(id)) {
            fail(`${at}.dependsOn[${dependencyIndex}]`, "invalid, self or duplicate dependency");
          }
          seen.add(id);
        });
      }
    }
    if (item.type === "frontend") {
      text(item.runner, `${at}.runner`, true);
      text(item.test, `${at}.test`);
    } else if (item.type === "api") {
      if (record(item.request, `${at}.request`, ["method", "path", "headers", "body"])) {
        if (!methods.has(item.request.method)) fail(`${at}.request.method`, "unsupported HTTP method");
        const path = item.request.path;
        if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[\\#\u0000-\u001f\u007f]/.test(path)) {
          fail(`${at}.request.path`, "expected a service-relative path without fragments or control characters");
        }
        if (item.request.headers !== undefined) {
          if (!isRecord(item.request.headers)) fail(`${at}.request.headers`, "expected an object of string values");
          else for (const [name, value] of Object.entries(item.request.headers)) {
            if (!isText(name) || typeof value !== "string" || /[\r\n]/.test(name + value)) {
              fail(`${at}.request.headers`, "expected nonempty header names and string values without line breaks");
            }
          }
        }
        if (["GET", "HEAD"].includes(item.request.method) && Object.hasOwn(item.request, "body")) {
          fail(`${at}.request.body`, "omit bodies for GET and HEAD");
        }
      }
      if (record(item.expect, `${at}.expect`, ["status", "json", "present"])) {
        if (!Number.isInteger(item.expect.status) || item.expect.status < 100 || item.expect.status > 599) {
          fail(`${at}.expect.status`, "expected an HTTP status from 100 through 599");
        }
        if (item.expect.json !== undefined) {
          if (!isRecord(item.expect.json)) fail(`${at}.expect.json`, "expected a JSON-pointer-to-value object");
          else for (const pointer of Object.keys(item.expect.json)) {
            if (!isPointer(pointer)) fail(`${at}.expect.json`, "expected JSON pointer keys");
          }
        }
        if (item.expect.present !== undefined) pointers(item.expect.present, `${at}.expect.present`);
      }
    } else fail(`${at}.type`, "expected api or frontend");
  });

  const pending = new Map([...ids.keys()].map(id => [id, 0]));
  const dependents = new Map([...ids.keys()].map(id => [id, []]));
  for (const [id, item] of ids) {
    if (!Array.isArray(item.dependsOn)) continue;
    for (const dependency of new Set(item.dependsOn)) {
      if (!ids.has(dependency)) fail(`case(${id}).dependsOn`, "unknown dependency identity");
      else {
        pending.set(id, pending.get(id) + 1);
        dependents.get(dependency).push(id);
      }
    }
  }
  const ready = [...pending.keys()].filter(id => pending.get(id) === 0);
  for (let index = 0; index < ready.length; index++) {
    for (const id of dependents.get(ready[index])) {
      pending.set(id, pending.get(id) - 1);
      if (pending.get(id) === 0) ready.push(id);
    }
  }
  if (ready.length !== ids.size) fail("batch.cases.dependsOn", "dependency cycle");
  return errors;
}

async function main(args) {
  if (args.length !== 1 || args[0] === "--help") {
    console.log("Usage: node validate-batch.mjs <batch.json>");
    return args[0] === "--help" ? 0 : 2;
  }
  let batch;
  try { batch = JSON.parse(await readFile(args[0], "utf8")); }
  catch { console.error("Cannot read a valid JSON batch."); return 1; }
  const errors = validateBatch(batch);
  if (errors.length) { console.error(errors.join("\n")); return 1; }
  console.log(`Valid batch (${batch.cases.length} cases); execution bindings are not checked.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
