import { Box, Text } from "ink";
import type { JSX, ReactNode } from "react";

export interface PaneProps {
  title: string;
  children: ReactNode;
  focused?: boolean;
  width?: string | number;
}

export function Pane({ title, children, focused = false, width = "100%" }: PaneProps): JSX.Element {
  return (
    <Box
      flexDirection="column"
      width={width}
      flexGrow={1}
      borderStyle="single"
      borderColor={focused ? "cyan" : "gray"}
      paddingX={1}
    >
      <Text color={focused ? "cyan" : "gray"} wrap="truncate-end">
        {title}
      </Text>
      {children}
    </Box>
  );
}
