#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, "..");
const generators = [
  "packages/cli/generate-version.mjs",
  "packages/tui/generate-version.mjs",
];

for (const generator of generators) {
  const fullPath = join(repoRoot, generator);
  if (!existsSync(fullPath)) {
    continue;
  }

  const result = spawnSync(process.execPath, [fullPath], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
