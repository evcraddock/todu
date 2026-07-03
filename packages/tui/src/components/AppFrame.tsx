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
  terminalHeight?: number;
}

export function AppFrame({
  route,
  connection,
  projectFilter,
  syncStatus,
  children,
  terminalWidth,
  terminalHeight,
}: AppFrameProps): JSX.Element {
  const { stdout } = useStdout();
  const size = resolveTerminalSize({
    width: terminalWidth ?? stdout.columns,
    height: terminalHeight ?? stdout.rows,
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} width={size.width} height={size.height}>
      <Box flexDirection="row" height={1} flexShrink={0}>
        <Text color="cyan" bold wrap="truncate-end">
          Todu
        </Text>
        <Text color="gray" wrap="truncate-end">
          {" "}
          • {routeLabels[route]}
        </Text>
      </Box>
      <Box height={1} flexShrink={0}>
        <StatusLine
          route={route}
          connection={connection}
          projectFilter={projectFilter}
          syncStatus={syncStatus}
        />
      </Box>
      <Box flexDirection="column" flexGrow={1} marginY={1}>
        {children}
      </Box>
      <Box height={1} flexShrink={0}>
        <HelpBar />
      </Box>
    </Box>
  );
}

export interface TerminalSizeInput {
  width: number | undefined;
  height: number | undefined;
}

export interface TerminalSize {
  width: number;
  height: number;
}

export function resolveTerminalSize({ width, height }: TerminalSizeInput): TerminalSize {
  return {
    width: width && width > 0 ? width : 80,
    height: height && height > 0 ? height : 24,
  };
}
