#!/usr/bin/env node
import { readFileSync } from "node:fs";

const generatedVersionFiles = [
  ["packages/cli/package.json", "packages/cli/src/version.ts", "@todu/cli"],
  ["packages/tui/package.json", "packages/tui/src/version.ts", "@todu/tui"],
];

let ok = true;

for (const [packageJsonPath, versionSourcePath, packageName] of generatedVersionFiles) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const source = readFileSync(versionSourcePath, "utf8");
  const match = source.match(/VERSION = "([^"]+)"/);

  if (!match) {
    console.error(`❌ ${versionSourcePath} does not export a VERSION constant`);
    ok = false;
    continue;
  }

  const sourceVersion = match[1];
  if (packageJson.version !== sourceVersion) {
    console.error(
      `❌ ${packageName} generated version mismatch: package.json=${packageJson.version} source=${sourceVersion}`,
    );
    ok = false;
  }
}

if (!ok) {
  process.exit(1);
}

console.log("✅ Generated package versions are in sync");
