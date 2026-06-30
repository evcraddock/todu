import { Text } from "ink";
import type { JSX } from "react";
import { type AppRoute, routeLabels } from "../app/routes.js";
import type { DaemonConnectionSnapshot } from "../daemon/connection.js";

export interface StatusLineProps {
  route: AppRoute;
  connection: DaemonConnectionSnapshot;
}

export function StatusLine({ route, connection }: StatusLineProps): JSX.Element {
  return (
    <Text color="gray" wrap="truncate-end">
      View: {routeLabels[route]} • Daemon: {formatConnectionState(connection)}
    </Text>
  );
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
