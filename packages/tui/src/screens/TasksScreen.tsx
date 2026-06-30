import { Box, Text } from "ink";
import type { JSX } from "react";

export function TasksScreen(): JSX.Element {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Tasks</Text>
      <Text color="gray">Task list placeholder.</Text>
      <Text color="gray">The next TUI task will add active task browsing and details.</Text>
    </Box>
  );
}
