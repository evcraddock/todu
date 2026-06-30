import type { Project, Task, TaskWithDetail } from "@todu/core";
import { Box, Text } from "ink";
import type { JSX } from "react";
import { formatToduClientError } from "../../daemon/todu-client.js";
import { createProjectNameMap, formatTaskDetailLines } from "../../formatting/task.js";

export interface TaskDetailPaneProps {
  task: Task | null;
  detail?: TaskWithDetail;
  projects?: readonly Project[];
  isLoadingDetail: boolean;
  error: unknown;
}

export function TaskDetailPane({
  task,
  detail,
  projects,
  isLoadingDetail,
  error,
}: TaskDetailPaneProps): JSX.Element {
  const projectNames = createProjectNameMap(projects);
  const detailTask = detail ?? task;

  return (
    <Box flexDirection="column" width="50%" paddingLeft={1}>
      <Text color="cyan">Detail</Text>
      {!detailTask ? <Text color="gray">No task selected.</Text> : null}
      {detailTask
        ? formatTaskDetailLines(detailTask, projectNames.get(detailTask.projectId) ?? null).map(
            (line, index) => (
              <Text
                key={`${detailTask.id}-${index}`}
                color={index === 0 ? "white" : "gray"}
                wrap="truncate-end"
              >
                {line}
              </Text>
            ),
          )
        : null}
      {isLoadingDetail ? <Text color="yellow">Loading detail…</Text> : null}
      {error ? <Text color="red">{formatToduClientError(error)}</Text> : null}
    </Box>
  );
}
