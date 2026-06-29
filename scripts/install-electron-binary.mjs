#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const electronPackagePath = require.resolve("electron/package.json");
const electronRoot = dirname(electronPackagePath);
const { version } = require(electronPackagePath);
const { downloadArtifact } = require("@electron/get");

function getPlatformPath(platform) {
  switch (platform) {
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`);
  }
}

const platform = process.env.npm_config_platform || process.platform;
const arch = process.env.npm_config_arch || process.arch;
const platformPath = getPlatformPath(platform);
const distPath = join(electronRoot, "dist");
const executablePath = join(distPath, platformPath);

if (existsSync(executablePath)) {
  writeFileSync(join(electronRoot, "path.txt"), platformPath);
  console.log(`Electron ${version} binary already installed for ${platform}-${arch}`);
  process.exit(0);
}

const zipPath = await downloadArtifact({
  version,
  artifactName: "electron",
  platform,
  arch,
  force: process.env.force_no_cache === "true",
  checksums: require(join(electronRoot, "checksums.json")),
});

rmSync(distPath, { recursive: true, force: true });
mkdirSync(distPath, { recursive: true });

const unzip = spawnSync("unzip", ["-q", "-o", zipPath, "-d", distPath], {
  stdio: "inherit",
});

if (unzip.error) {
  throw new Error(`Failed to run unzip for Electron ${version}: ${unzip.error.message}`);
}

if (unzip.status !== 0) {
  throw new Error(`Failed to unzip Electron ${version} archive: exit ${unzip.status}`);
}

if (!existsSync(executablePath)) {
  throw new Error(`Electron ${version} archive did not contain expected executable: ${executablePath}`);
}

writeFileSync(join(electronRoot, "path.txt"), platformPath);
console.log(`Installed Electron ${version} binary for ${platform}-${arch}`);
