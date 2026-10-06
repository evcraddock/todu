import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(scriptDir, "..");
const daemonDistDir = path.resolve(electronDir, "../daemon/dist");
const bundledDaemonDir = path.resolve(electronDir, "dist/daemon");

if (!fs.existsSync(daemonDistDir)) {
  throw new Error(`Daemon build output not found: ${daemonDistDir}`);
}

fs.rmSync(bundledDaemonDir, { recursive: true, force: true });
fs.cpSync(daemonDistDir, bundledDaemonDir, { recursive: true });

const readVersion = (name) =>
  JSON.parse(fs.readFileSync(path.resolve(electronDir, `../${name}/package.json`), "utf8")).version;
const versions = Object.fromEntries(
  ["electron", "daemon", "core", "engine", "cli"].map((name) => [name, readVersion(name)]),
);
versions.electronRuntime = createRequire(import.meta.url)("electron/package.json").version;
fs.writeFileSync(
  path.join(electronDir, "dist/desktop-runtime.json"),
  `${JSON.stringify(versions, null, 2)}\n`,
);

console.log(`Bundled daemon runtime: ${path.relative(electronDir, bundledDaemonDir)}`);
