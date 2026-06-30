import { useQuery } from "@tanstack/react-query";
import { Box, Text } from "ink";
import type { JSX } from "react";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import { queryKeys } from "../state/query-keys.js";

export interface DataStatusScreenProps {
  client: TuiToduClient;
}

export function DataStatusScreen({ client }: DataStatusScreenProps): JSX.Element {
  const projects = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => client.project.list(),
  });
  const tasks = useQuery({
    queryKey: queryKeys.tasks(),
    queryFn: () => client.task.list(),
  });

  const error = projects.error ?? tasks.error;

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Data status unavailable</Text>
        <Text color="gray">{formatToduClientError(error)}</Text>
      </Box>
    );
  }

  if (projects.isLoading || tasks.isLoading) {
    return <Text color="yellow">Loading daemon data…</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text color="green">Data status ready</Text>
      <Text color="gray">Projects: {projects.data?.length ?? 0}</Text>
      <Text color="gray">Tasks: {tasks.data?.length ?? 0}</Text>
    </Box>
  );
}
