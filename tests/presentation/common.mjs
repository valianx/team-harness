import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, open, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const harnessRoot = path.dirname(fileURLToPath(import.meta.url));
export const repository = path.resolve(harnessRoot, "../..");
export const template = path.join(repository, "skills/interactive-presentation/references/templates");

export function argumentsFor(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!["--workspace", "--candidate"].includes(argv[i]) || !argv[i + 1]) {
      throw new Error("Use --workspace <absolute external directory> --candidate <revision or run identity>.");
    }
    options[argv[i].slice(2)] = argv[i + 1];
  }
  if (!path.isAbsolute(options.workspace ?? "")) throw new Error("--workspace must be absolute.");
  const workspace = path.resolve(options.workspace);
  if (workspace === repository || workspace.startsWith(`${repository}${path.sep}`)) {
    throw new Error("Run artifacts must be outside the repository.");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(options.candidate ?? "")) {
    throw new Error("--candidate must be a revision or safe run identity.");
  }
  return { ...options, workspace, runDirectory: path.join(workspace, "testing/runs", options.candidate) };
}

export async function physicalDirectory(directory, create = false) {
  const absolute = path.resolve(directory);
  const parts = absolute.split(path.sep).filter(Boolean);
  let current = path.parse(absolute).root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const entry = await lstat(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Expected a physical directory: ${current}`);
    } catch (error) {
      if (error.code !== "ENOENT" || !create) throw error;
      await mkdir(current);
    }
  }
  const physical = await realpath(absolute);
  const owningRepository = await realpath(repository);
  if (physical === owningRepository || physical.startsWith(`${owningRepository}${path.sep}`)) {
    throw new Error("Run artifacts must be physically outside the repository.");
  }
  return physical;
}

export async function claimRunDirectory(options) {
  await physicalDirectory(options.workspace);
  await physicalDirectory(path.dirname(options.runDirectory), true);
  try { await mkdir(options.runDirectory); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error(`Run already exists; preserve its evidence and choose a new --candidate: ${options.runDirectory}`);
    throw error;
  }
}

export async function fingerprint(directory) {
  const hash = createHash("sha256");
  async function visit(current, prefix = "") {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (["node_modules", "dist"].includes(entry.name)) continue;
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) await visit(path.join(current, entry.name), relative);
      else if (entry.isFile()) hash.update(relative).update("\0").update(await readFile(path.join(current, entry.name))).update("\0");
      else throw new Error(`Unsupported non-regular source: ${relative}`);
    }
  }
  await visit(directory);
  return hash.digest("hex");
}

export async function saveJson(filename, value) {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

export async function command(executable, args, { cwd, log, env = process.env } = {}) {
  const chunks = [];
  const handle = log ? await open(log, "wx") : undefined;
  let writes = Promise.resolve();
  const child = spawn(executable, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const append = (chunk) => { chunks.push(chunk); if (handle) writes = writes.then(() => handle.write(chunk)); };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  let code;
  try {
    code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
  } finally { await writes; await handle?.close(); }
  const output = Buffer.concat(chunks).toString("utf8");
  if (code !== 0) throw new Error(`${executable} ${args.join(" ")} exited ${code}. ${log ? `See ${log}.` : output.slice(-2000)}`);
  return output;
}
