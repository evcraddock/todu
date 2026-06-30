import { Box, Text } from "ink";
import type { JSX } from "react";

export function ProjectsScreen(): JSX.Element {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Projects</Text>
      <Text color="gray">Projects placeholder.</Text>
      <Text color="gray">Project filtering lands after the task read model.</Text>
    </Box>
  );
}
