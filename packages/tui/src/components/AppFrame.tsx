import { Box, Text, useStdout } from "ink";
import type { JSX, ReactNode } from "react";
import { type FooterContext, primaryRouteKeyBindings } from "../app/keymap.js";
import { type AppRoute, routeLabels } from "../app/routes.js";
import type { TuiTaskFilterState } from "../state/task-filter.js";
import { formatTaskFilterSummary } from "../state/task-filter.js";
import { HelpBar } from "./HelpBar.js";

export interface AppFrameProps {
  route: AppRoute;
  taskFilter: TuiTaskFilterState;
  footerContext: FooterContext;
  children: ReactNode;
  terminalWidth?: number;
  terminalHeight?: number;
}

export function AppFrame({
  route,
  taskFilter,
  footerContext,
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
      <Box height={1} flexShrink={0}>
        <Text color="cyan" bold wrap="truncate-end">
          {routeLabels[route]}
        </Text>
      </Box>
      <Box height={1} flexShrink={0}>
        <Text color="white" wrap="truncate-end">
          {formatTaskFilterSummary(taskFilter)}
        </Text>
      </Box>
      <Box height={1} flexShrink={0}>
        <Text color="gray" wrap="truncate-end">
          {primaryRouteKeyBindings
            .map((binding) => `${binding.keys} ${binding.description}`)
            .join("  •  ")}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} marginY={1}>
        {children}
      </Box>
      <Box height={1} flexShrink={0}>
        <HelpBar context={footerContext} />
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
