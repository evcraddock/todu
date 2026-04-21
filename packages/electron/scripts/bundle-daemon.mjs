import fs from "node:fs";
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

console.log(`Bundled daemon runtime: ${path.relative(electronDir, bundledDaemonDir)}`);
