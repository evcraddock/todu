import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const unpackedDir = args.get("unpacked-dir") ? path.resolve(args.get("unpacked-dir")) : null;
const appBundleArg = args.get("app-bundle");
const appBundle = appBundleArg ? resolveAppBundlePath(path.resolve(appBundleArg)) : null;
const executableArg = args.get("executable");
const appPathArg = args.get("app-path");
const executablePath = executableArg
  ? path.resolve(executableArg)
  : appBundle
    ? resolveMacExecutablePath(appBundle)
    : unpackedDir
      ? resolveExecutablePath(unpackedDir)
      : null;
const appPath = appPathArg
  ? path.resolve(appPathArg)
  : appBundle
    ? path.join(appBundle, "Contents", "Resources", "app.asar")
    : unpackedDir
      ? path.join(unpackedDir, "resources", "app.asar")
      : null;

if (!executablePath || !appPath) {
  throw new Error(
    "Usage: node scripts/validate-daemon-bundle.mjs (--unpacked-dir <path> | --app-bundle <path> | --executable <path> --app-path <path>)",
  );
}

const entrypointPath = path.join(appPath, "dist", "daemon", "entrypoint.js");
if (!fs.existsSync(executablePath)) {
  throw new Error(`Packaged executable not found: ${executablePath}`);
}

const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), "todu-electron-daemon-bundle-"));
const socketPath = path.join(storagePath, "daemon.sock");
const daemon = spawn(executablePath, [entrypointPath], {
  cwd: path.dirname(executablePath),
  detached: true,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    TODU_CONFIG: "",
    TODU_DATA_DIR: storagePath,
    TODU_DAEMON_SOCKET: socketPath,
  },
  stdio: ["ignore", "ignore", "pipe"],
});

let stderr = "";
daemon.stderr?.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  await waitForSocket(socketPath, daemon, stderr);
  console.log(`Validated bundled daemon startup via ${entrypointPath}`);
} finally {
  await stopProcess(daemon);
}

function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    parsed.set(argv[index]?.replace(/^--/, ""), argv[index + 1]);
  }
  return parsed;
}

async function waitForSocket(socketPath, child, stderr) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (fs.existsSync(socketPath)) {
      return;
    }

    if (child.exitCode !== null) {
      throw new Error(`Packaged daemon exited early with code ${child.exitCode}: ${stderr}`);
    }

    await sleep(50);
  }

  throw new Error(`Timed out waiting for packaged daemon socket: ${socketPath}\n${stderr}`);
}

async function stopProcess(processHandle) {
  if (processHandle.exitCode !== null) {
    return;
  }

  processHandle.kill("SIGTERM");

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (processHandle.exitCode === null) {
        processHandle.kill("SIGKILL");
      }
      resolve();
    }, 3000);

    processHandle.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveExecutablePath(unpackedDir) {
  const ignoredNames = new Set([
    "chrome_crashpad_handler",
    "chrome-sandbox",
    "libEGL.so",
    "libffmpeg.so",
    "libGLESv2.so",
    "libvk_swiftshader.so",
    "libvulkan.so.1",
    "vk_swiftshader_icd.json",
    "resources.pak",
    "snapshot_blob.bin",
    "v8_context_snapshot.bin",
    "vk_swiftshader_icd.json",
  ]);
  const entries = fs.readdirSync(unpackedDir, { withFileTypes: true }).filter((entry) => entry.isFile());
  const candidates = entries
    .map((entry) => entry.name)
    .filter((name) => !ignoredNames.has(name))
    .filter((name) => !name.endsWith(".dll"))
    .filter((name) => !name.endsWith(".pak"))
    .filter((name) => !name.endsWith(".bin"))
    .filter((name) => {
      const fullPath = path.join(unpackedDir, name);
      if (process.platform === "win32") {
        return name.endsWith(".exe");
      }
      return (fs.statSync(fullPath).mode & 0o111) !== 0;
    });

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one packaged executable in ${unpackedDir}, found: ${candidates.join(", ") || "none"}`,
    );
  }

  return path.join(unpackedDir, candidates[0]);
}

function resolveAppBundlePath(appBundlePath) {
  if (fs.existsSync(appBundlePath)) {
    return appBundlePath;
  }

  const searchRoot = findExistingParentDirectory(appBundlePath);
  if (!searchRoot) {
    throw new Error(`App bundle search root not found for: ${appBundlePath}`);
  }

  const bundleName = path.basename(appBundlePath);
  const bundleStem = path.basename(bundleName, ".app");
  const candidates = findAppBundles(searchRoot).filter((bundlePath) => {
    const name = path.basename(bundlePath);
    return name === bundleName || name.startsWith(bundleStem);
  });

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one app bundle under ${searchRoot} for ${bundleName}, found: ${candidates.join(", ") || "none"}`,
    );
  }

  return candidates[0];
}

function findExistingParentDirectory(targetPath) {
  let currentPath = targetPath;
  while (currentPath !== path.dirname(currentPath)) {
    currentPath = path.dirname(currentPath);
    if (fs.existsSync(currentPath)) {
      return currentPath;
    }
  }
  return fs.existsSync(currentPath) ? currentPath : null;
}

function findAppBundles(rootDir) {
  const bundles = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const entryPath = path.join(currentDir, entry.name);
      if (entry.name.endsWith(".app")) {
        bundles.push(entryPath);
        continue;
      }

      queue.push(entryPath);
    }
  }

  return bundles;
}

function resolveMacExecutablePath(appBundlePath) {
  const macOsDir = path.join(appBundlePath, "Contents", "MacOS");
  if (!fs.existsSync(macOsDir)) {
    throw new Error(`App bundle executable directory not found: ${macOsDir}`);
  }

  const candidates = fs
    .readdirSync(macOsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one macOS executable in ${macOsDir}, found: ${candidates.join(", ") || "none"}`,
    );
  }

  return path.join(macOsDir, candidates[0]);
}
