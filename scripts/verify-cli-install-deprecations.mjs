#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const deprecatedGlobPattern = /deprecated glob@10\.5\.0/i;
const tempDir = mkdtempSync(path.join(tmpdir(), "todu-cli-install-"));
const prefixDir = path.join(tempDir, "prefix");
const workspaces = ["packages/core", "packages/engine", "packages/daemon", "packages/cli"];

try {
  for (const workspace of workspaces) {
    const distPath = path.join(workspace, "dist", "index.js");
    run("node", ["-e", `const fs=require('fs'); if (!fs.existsSync(${JSON.stringify(distPath)})) process.exit(1)`], {
      failureMessage: `${distPath} is missing; run npm run build before verifying packed CLI install.`,
    });
  }

  const tarballs = workspaces.map((workspace) => packWorkspace(workspace));
  const install = run("npm", ["install", "-g", "--prefix", prefixDir, ...tarballs]);
  if (deprecatedGlobPattern.test(install.combinedOutput)) {
    throw new Error(`npm install emitted deprecated glob@10.5.0 warning:\n${install.combinedOutput}`);
  }

  console.log("CLI install verification passed: no glob@10.5.0 deprecation warning.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function packWorkspace(workspace) {
  const pack = run("npm", ["pack", "--workspace", workspace, "--pack-destination", tempDir, "--json"]);
  const packed = JSON.parse(pack.stdout.trim());
  const filename = packed[0]?.filename;
  if (typeof filename !== "string" || filename.length === 0) {
    throw new Error(`Unable to determine packed tarball from npm pack output for ${workspace}: ${pack.stdout}`);
  }
  return path.join(tempDir, filename);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.error) {
    throw new Error(`${options.failureMessage ?? `Command failed: ${command}`}\n${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${options.failureMessage ?? `Command failed: ${command} ${args.join(" ")}`}\n${combinedOutput}`,
    );
  }

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    combinedOutput,
  };
}
