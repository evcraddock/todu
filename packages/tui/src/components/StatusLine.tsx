import { Text } from "ink";
import type { JSX } from "react";
import { type AppRoute, routeLabels } from "../app/routes.js";
import type { DaemonConnectionSnapshot } from "../daemon/connection.js";
import type { TuiSyncStatus } from "../daemon/todu-client.js";
import { describeProjectFilter, type ProjectFilterState } from "../state/project-filter.js";

export interface StatusLineProps {
  route: AppRoute;
  connection: DaemonConnectionSnapshot;
  projectFilter: ProjectFilterState;
  syncStatus?: TuiSyncStatus;
}

export function StatusLine({
  route,
  connection,
  projectFilter,
  syncStatus,
}: StatusLineProps): JSX.Element {
  return (
    <Text color="gray" wrap="truncate-end">
      View: {routeLabels[route]} • Project: {describeProjectFilter(projectFilter)} • Daemon:{" "}
      {formatConnectionState(connection)} • Sync: {formatSyncStatus(syncStatus)}
    </Text>
  );
}

function formatSyncStatus(syncStatus: TuiSyncStatus | undefined): string {
  return syncStatus?.remote.state ?? "unknown";
}

function formatConnectionState(connection: DaemonConnectionSnapshot): string {
  if (connection.state === "connected") {
    return connection.hello?.daemonVersion
      ? `connected (${connection.hello.daemonVersion})`
      : "connected";
  }

  if (connection.state === "failed") {
    return "unavailable";
  }

  return connection.state;
}
