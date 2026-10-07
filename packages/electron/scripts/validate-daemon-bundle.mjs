import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePackagedDesktop } from "./desktop-validation.mjs";

const args = new Map();
const argv = process.argv.slice(2);
const allowed = new Set(["unpacked-dir", "app-bundle", "executable", "app-path"]);
for (let index = 0; index < argv.length; index += 2) {
  const name = argv[index]?.replace(/^--/, "");
  if (!allowed.has(name) || !argv[index + 1])
    throw new Error(`Invalid packaged desktop validation argument: ${argv[index]}`);
  args.set(name, path.resolve(argv[index + 1]));
}
let executablePath = args.get("executable");
let appPath = args.get("app-path");
if (args.has("app-bundle")) {
  const bundle = args.get("app-bundle");
  if (!fs.existsSync(bundle)) throw new Error(`App bundle not found: ${bundle}`);
  executablePath = singleExecutable(path.join(bundle, "Contents/MacOS"));
  appPath = path.join(bundle, "Contents/Resources/app.asar");
} else if (args.has("unpacked-dir")) {
  executablePath = singleExecutable(args.get("unpacked-dir"));
  appPath = path.join(args.get("unpacked-dir"), "resources/app.asar");
}
if (!executablePath || !appPath)
  throw new Error(
    "Usage: validate-daemon-bundle.mjs (--unpacked-dir <path> | --app-bundle <path> | --executable <path> --app-path <path>)",
  );
await validatePackagedDesktop({
  executablePath,
  appPath,
  rootDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."),
});

function singleExecutable(directory) {
  const excluded = new Set(["chrome_crashpad_handler", "chrome-sandbox"]);
  const candidates = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        !excluded.has(entry.name) &&
        !/\.(?:so(?:\.\d+)*|dll|pak|bin)$/.test(entry.name),
    )
    .map((entry) => path.join(directory, entry.name))
    .filter((name) =>
      process.platform === "win32" ? name.endsWith(".exe") : (fs.statSync(name).mode & 0o111) !== 0,
    );
  if (candidates.length !== 1)
    throw new Error(
      `Expected one packaged executable in ${directory}, found ${candidates.join(", ") || "none"}`,
    );
  return candidates[0];
}
