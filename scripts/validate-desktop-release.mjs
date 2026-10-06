import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length !== 1 && !(args.length === 3 && args[1] === "--root-dir")) {
  throw new Error("Usage: node scripts/validate-desktop-release.mjs vX.Y.Z [--root-dir <path>]");
}
const tag = args[0];
if (
  !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    tag,
  )
) {
  throw new Error(`Invalid desktop release tag: ${tag}`);
}
const rootDir = args[2]
  ? path.resolve(args[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readManifest = (name) =>
  JSON.parse(fs.readFileSync(path.join(rootDir, name, "package.json"), "utf8"));
const root = readManifest(".");
const desktop = readManifest("packages/electron");
if (root.version !== desktop.version)
  throw new Error(`Root/desktop version mismatch: ${root.version} / ${desktop.version}`);
if (!root.private || !desktop.private)
  throw new Error("Desktop/root workspaces must remain private");
if (tag !== `v${desktop.version}`)
  throw new Error(`Tag ${tag} does not match desktop ${desktop.version}`);
console.log(
  JSON.stringify({
    desktop: desktop.version,
    cli: readManifest("packages/cli").version,
    daemon: readManifest("packages/daemon").version,
    core: readManifest("packages/core").version,
    engine: readManifest("packages/engine").version,
  }),
);
