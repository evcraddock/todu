import type { ToduFileConfig } from "@todu/core";

export const TODU_DAEMON_ASSIGNED_WORKERS_ENV = "TODU_DAEMON_ASSIGNED_WORKERS";

export interface ResolvedDaemonAssignedWorkers {
  value: string | undefined;
  source: "env" | "file" | "unset";
}

export function resolveDaemonAssignedWorkers(
  config: ToduFileConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedDaemonAssignedWorkers {
  const envValue = env[TODU_DAEMON_ASSIGNED_WORKERS_ENV];
  if (envValue !== undefined) {
    return {
      value: envValue,
      source: "env",
    };
  }

  const fileAssigned = config.daemon?.workers?.assigned;
  if (!fileAssigned) {
    return {
      value: undefined,
      source: "unset",
    };
  }

  return {
    value: fileAssigned.map((workerType) => workerType.trim()).join(","),
    source: "file",
  };
}
