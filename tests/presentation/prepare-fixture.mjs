import { cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { argumentsFor, claimRunDirectory, command, fingerprint, harnessRoot, repository, saveJson, template } from "./common.mjs";

try {
  const options = argumentsFor();
  const app = path.join(options.runDirectory, "app");
  await readFile(path.join(template, "package-lock.json"));
  const sourceFingerprint = await fingerprint(template);
  const fixtureFingerprint = await fingerprint(path.join(harnessRoot, "fixture"));
  await claimRunDirectory(options);
  await cp(template, app, { recursive: true, filter: (filename) => !["node_modules", "dist"].includes(path.basename(filename)) });
  await cp(path.join(harnessRoot, "fixture/fixture.tsx"), path.join(app, "src/fixture.tsx"));
  await cp(path.join(harnessRoot, "fixture/meeting-diagram.svg"), path.join(app, "public/meeting-diagram.svg"));
  const audio = Buffer.alloc(44 + 16000 * 4);
  audio.write("RIFF"); audio.writeUInt32LE(audio.length - 8, 4); audio.write("WAVEfmt ", 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write("data", 36); audio.writeUInt32LE(audio.length - 44, 40);
  await writeFile(path.join(app, "public/focus-tone.wav"), audio, { flag: "wx" });
  await writeFile(path.join(app, "src/main.tsx"), `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport { Fixture } from "./fixture";\nimport "./styles/globals.css";\nReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);\n`);
  await command("npm", ["ci", "--no-audit", "--no-fund"], { cwd: app, log: path.join(options.runDirectory, "dependency-install.log") });
  await command("npm", ["run", "build"], { cwd: app, log: path.join(options.runDirectory, "build.log") });
  const dependencies = JSON.parse(await command("npm", ["ls", "--depth=0", "--json"], { cwd: app }));
  const revision = (await command("git", ["rev-parse", "HEAD"], { cwd: repository })).trim();
  await saveJson(path.join(options.runDirectory, "prepared.json"), {
    candidate: options.candidate, revision, sourceFingerprint, fixtureFingerprint,
    created: new Date().toISOString(), repository, template, app,
    node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    dependencies: dependencies.dependencies,
    commands: ["npm ci --no-audit --no-fund", "npm run build", "npm ls --depth=0 --json"],
  });
  console.log(`Prepared real copied template: ${app}`);
} catch (error) {
  console.error(`Presentation fixture preparation failed: ${error.message}`);
  process.exitCode = 1;
}
