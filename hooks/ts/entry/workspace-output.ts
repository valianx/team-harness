import * as fs from "node:fs";
import * as path from "node:path";

/** Write only a direct, unaliased hook output; callers retain fail-open behavior. */
export function writeWorkspaceOutput(workspace: string, target: string, content: string, append: boolean): void {
  const parent = fs.realpathSync(workspace);
  if (fs.realpathSync(path.dirname(target)) !== parent) throw new Error("output outside workspace");
  let previous: fs.Stats | undefined;
  try { previous = fs.lstatSync(target); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (previous && (!previous.isFile() || previous.nlink !== 1)) throw new Error("output is linked or non-regular");

  // Delay truncation until the opened file has been checked; O_EXCL also
  // prevents a missing output from becoming a followed link during creation.
  const flags = fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0)
    | (previous ? 0 : fs.constants.O_CREAT | fs.constants.O_EXCL)
    | (append ? fs.constants.O_APPEND : 0);
  const descriptor = fs.openSync(target, flags, 0o600);
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1
      || (previous && (opened.dev !== previous.dev || opened.ino !== previous.ino))) {
      throw new Error("output changed or is linked");
    }
    if (!append) fs.ftruncateSync(descriptor, 0);
    fs.writeFileSync(descriptor, content, "utf8");
  } finally { fs.closeSync(descriptor); }
}
