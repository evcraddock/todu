import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";

export type TuiLaunchSource = "package" | "workspace-dist" | "workspace-source";

export interface TuiLaunchTarget {
  command: string;
  args: string[];
  source: TuiLaunchSource;
}

interface ResolveTuiLaunchTargetOptions {
  cliEntrypointPath?: string;
  cwd?: string;
  nodePath?: string;
  fileExists?: (filePath: string) => boolean;
  resolveSpecifier?: (specifier: string) => string;
}

interface LaunchTuiOptions extends ResolveTuiLaunchTargetOptions {
  env?: NodeJS.ProcessEnv;
  stdio?: "inherit" | "pipe";
}

export function registerTuiCommand(
  program: Command,
  launch: (args: readonly string[]) => Promise<number> = launchTui,
): void {
  program
    .command("tui")
    .description("Launch the Todu terminal UI")
    .argument("[args...]", "arguments to pass to todu-tui")
    .allowUnknownOption(true)
    .action(async (args: string[]) => {
      const exitCode = await launch(args);
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
    });
}

export async function launchTui(
  args: readonly string[],
  options: LaunchTuiOptions = {},
): Promise<number> {
  const target = resolveTuiLaunchTarget(args, options);
  if (!target) {
    throw new Error(
      "Unable to locate the Todu TUI entrypoint. Install @todu/tui or run `npm run build:tui` from a source checkout.",
    );
  }

  const child = spawn(target.command, target.args, {
    env: options.env ?? process.env,
    stdio: options.stdio ?? "inherit",
  });

  return new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (typeof code === "number") {
        resolve(code);
        return;
      }
      reject(new Error(`Todu TUI exited from signal ${signal ?? "unknown"}`));
    });
  });
}

export function resolveTuiLaunchTarget(
  tuiArgs: readonly string[],
  options: ResolveTuiLaunchTargetOptions = {},
): TuiLaunchTarget | null {
  const fileExists = options.fileExists ?? fs.existsSync;
  const nodePath = options.nodePath ?? process.execPath;
  const resolveSpecifier =
    options.resolveSpecifier ?? createDefaultResolver(options.cliEntrypointPath);
  const packageEntrypoint = resolvePackageEntrypoint(resolveSpecifier, fileExists);

  if (packageEntrypoint) {
    return {
      command: nodePath,
      args: [packageEntrypoint, ...tuiArgs],
      source: "package",
    };
  }

  for (const packageDir of getWorkspaceTuiPackageDirs(options)) {
    const distEntrypoint = path.join(packageDir, "dist", "index.js");
    if (fileExists(distEntrypoint)) {
      return {
        command: nodePath,
        args: [distEntrypoint, ...tuiArgs],
        source: "workspace-dist",
      };
    }

    const sourceEntrypoint = path.join(packageDir, "src", "index.tsx");
    const tsxEntrypoint = resolveTsxEntrypoint(resolveSpecifier, fileExists);
    if (fileExists(sourceEntrypoint) && tsxEntrypoint) {
      return {
        command: nodePath,
        args: [tsxEntrypoint, sourceEntrypoint, ...tuiArgs],
        source: "workspace-source",
      };
    }
  }

  return null;
}

function createDefaultResolver(
  cliEntrypointPath: string | undefined,
): (specifier: string) => string {
  const resolverPath = cliEntrypointPath ?? fileURLToPath(import.meta.url);
  return createRequire(resolverPath).resolve;
}

function resolvePackageEntrypoint(
  resolveSpecifier: (specifier: string) => string,
  fileExists: (filePath: string) => boolean,
): string | null {
  try {
    const entrypoint = resolveSpecifier("@todu/tui");
    return fileExists(entrypoint) ? entrypoint : null;
  } catch {
    return null;
  }
}

function resolveTsxEntrypoint(
  resolveSpecifier: (specifier: string) => string,
  fileExists: (filePath: string) => boolean,
): string | null {
  try {
    const packageJsonPath = resolveSpecifier("tsx/package.json");
    const entrypoint = path.join(path.dirname(packageJsonPath), "dist", "cli.mjs");
    return fileExists(entrypoint) ? entrypoint : null;
  } catch {
    return null;
  }
}

function getWorkspaceTuiPackageDirs(options: ResolveTuiLaunchTargetOptions): string[] {
  const candidates = [
    getSiblingTuiPackageDir(options.cliEntrypointPath),
    options.cwd ? path.join(options.cwd, "packages", "tui") : null,
  ];
  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))];
}

function getSiblingTuiPackageDir(cliEntrypointPath: string | undefined): string | null {
  if (!cliEntrypointPath) {
    return null;
  }

  let currentDir = path.dirname(cliEntrypointPath);
  for (let depth = 0; depth < 8; depth += 1) {
    const parentDir = path.dirname(currentDir);
    if (path.basename(currentDir) === "cli" && path.basename(parentDir) === "packages") {
      return path.join(parentDir, "tui");
    }
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }

  return null;
}
