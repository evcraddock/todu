import path from "node:path";
import { fileURLToPath } from "node:url";
import { Arch } from "builder-util";

export function assertSupportedMacArch({ platform, arch }) {
  if (platform === "darwin" && arch !== "arm64") {
    throw new Error(
      `Todu supports macOS on Apple Silicon (arm64) only; unsupported architecture: ${arch}. Use the arm64 build.`,
    );
  }
}

export function beforePack({ electronPlatformName, arch }) {
  assertSupportedMacArch({ platform: electronPlatformName, arch: Arch[arch] });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--require-macos")) {
    throw new Error("Usage: node packages/electron/scripts/macos-support.mjs [--require-macos]");
  }
  if (args[0] === "--require-macos" && process.platform !== "darwin") {
    throw new Error("Native macOS package validation requires an Apple Silicon Mac.");
  }
  assertSupportedMacArch({ platform: process.platform, arch: process.arch });
}
