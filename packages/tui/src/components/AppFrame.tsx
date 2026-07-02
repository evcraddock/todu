import { Box, Text, useStdout } from "ink";
import type { JSX, ReactNode } from "react";
import { type AppRoute, routeLabels } from "../app/routes.js";
import type { DaemonConnectionSnapshot } from "../daemon/connection.js";
import type { TuiSyncStatus } from "../daemon/todu-client.js";
import type { ProjectFilterState } from "../state/project-filter.js";
import { HelpBar } from "./HelpBar.js";
import { StatusLine } from "./StatusLine.js";

export interface AppFrameProps {
  route: AppRoute;
  connection: DaemonConnectionSnapshot;
  projectFilter: ProjectFilterState;
  syncStatus?: TuiSyncStatus;
  children: ReactNode;
  terminalWidth?: number;
}

export function AppFrame({
  route,
  connection,
  projectFilter,
  syncStatus,
  children,
  terminalWidth,
}: AppFrameProps): JSX.Element {
  const { stdout } = useStdout();
  const width = resolveTerminalWidth(terminalWidth ?? stdout.columns);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} width={width}>
      <Box flexDirection="row">
        <Text color="cyan" bold wrap="truncate-end">
          Todu
        </Text>
        <Text color="gray" wrap="truncate-end">
          {" "}
          • {routeLabels[route]}
        </Text>
      </Box>
      <StatusLine
        route={route}
        connection={connection}
        projectFilter={projectFilter}
        syncStatus={syncStatus}
      />
      <Box flexDirection="column" marginY={1}>
        {children}
      </Box>
      <HelpBar />
    </Box>
  );
}

function resolveTerminalWidth(width: number | undefined): number {
  return width && width > 0 ? width : 80;
}
