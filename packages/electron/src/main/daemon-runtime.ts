import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export interface ResolveDaemonEntrypointPathOptions {
  isPackaged: boolean;
  appPath?: string;
  moduleDir?: string;
}

export interface CreateDaemonLaunchSpecOptions extends ResolveDaemonEntrypointPathOptions {
  execPath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface DaemonLaunchSpec {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  entrypointPath: string;
}

export function resolveDaemonEntrypointPath(options: ResolveDaemonEntrypointPathOptions): string {
  if (options.isPackaged) {
    const appPath = options.appPath;
    if (!appPath) {
      throw new Error("Packaged daemon entrypoint resolution requires appPath");
    }

    return path.join(appPath, "dist", "daemon", "entrypoint.js");
  }

  return path.resolve(options.moduleDir ?? MODULE_DIR, "../../../daemon/src/entrypoint.ts");
}

export function createDaemonLaunchSpec(options: CreateDaemonLaunchSpecOptions): DaemonLaunchSpec {
  const entrypointPath = resolveDaemonEntrypointPath(options);
  const command = options.execPath ?? process.execPath;
  const env = {
    ...(options.env ?? process.env),
  };

  if (options.isPackaged) {
    return {
      command,
      args: [entrypointPath],
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      entrypointPath,
    };
  }

  return {
    command,
    args: [resolveTsxCliPath(options.moduleDir), entrypointPath],
    env,
    entrypointPath,
  };
}

function resolveTsxCliPath(moduleDir = MODULE_DIR): string {
  return path.resolve(moduleDir, "../../../../node_modules/tsx/dist/cli.mjs");
}
