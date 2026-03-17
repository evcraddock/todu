export const TODU_DAEMON_ASSIGNED_WORKERS_ENV = "TODU_DAEMON_ASSIGNED_WORKERS";
export const TODUAI_DAEMON_ASSIGNED_WORKERS_ENV = "TODUAI_DAEMON_ASSIGNED_WORKERS";

export interface ParsedWorkerAssignmentEnv {
  assignedWorkerTypes: string[] | undefined;
  duplicateWorkerTypes: string[];
  ignoredEntries: string[];
}

export function parseAssignedWorkerTypesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ParsedWorkerAssignmentEnv {
  const rawAssignments =
    env[TODU_DAEMON_ASSIGNED_WORKERS_ENV] ?? env[TODUAI_DAEMON_ASSIGNED_WORKERS_ENV];
  if (rawAssignments === undefined) {
    return {
      assignedWorkerTypes: undefined,
      duplicateWorkerTypes: [],
      ignoredEntries: [],
    };
  }

  if (rawAssignments.trim().length === 0) {
    return {
      assignedWorkerTypes: [],
      duplicateWorkerTypes: [],
      ignoredEntries: [],
    };
  }

  const assignedWorkerTypes: string[] = [];
  const duplicateWorkerTypes: string[] = [];
  const ignoredEntries: string[] = [];

  for (const rawEntry of rawAssignments.split(",")) {
    const workerType = rawEntry.trim();
    if (!workerType) {
      ignoredEntries.push(rawEntry);
      continue;
    }

    if (assignedWorkerTypes.includes(workerType)) {
      if (!duplicateWorkerTypes.includes(workerType)) {
        duplicateWorkerTypes.push(workerType);
      }
      continue;
    }

    assignedWorkerTypes.push(workerType);
  }

  return {
    assignedWorkerTypes,
    duplicateWorkerTypes,
    ignoredEntries,
  };
}
