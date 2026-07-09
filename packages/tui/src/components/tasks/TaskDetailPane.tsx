import type { Note, Project, Task, TaskWithDetail } from "@todu/core";
import { Box, Text } from "ink";
import type { JSX } from "react";
import { formatToduClientError } from "../../daemon/todu-client.js";
import { createProjectNameMap, formatTaskDetailLines } from "../../formatting/task.js";
import { Pane } from "../Pane.js";

export interface TaskDetailPaneProps {
  task: Task | null;
  detail?: TaskWithDetail;
  projects?: readonly Project[];
  isLoadingDetail: boolean;
  comments?: readonly Note[];
  isLoadingComments?: boolean;
  error: unknown;
  width?: string;
}

export function TaskDetailPane({
  task,
  detail,
  projects,
  isLoadingDetail,
  comments = [],
  isLoadingComments = false,
  error,
  width = "50%",
}: TaskDetailPaneProps): JSX.Element {
  const projectNames = createProjectNameMap(projects);
  const detailTask = detail ?? task;

  const loadingLabel = formatDetailLoadingLabel({ isLoadingDetail, isLoadingComments });

  return (
    <Pane title={`Detail${loadingLabel ? ` • ${loadingLabel}` : ""}`} width={width}>
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
      {comments.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">Comments</Text>
          {comments.slice(0, 5).map((comment) => (
            <Text key={comment.id} color="gray" wrap="truncate-end">
              {comment.content}
            </Text>
          ))}
        </Box>
      ) : null}
      {error ? <Text color="red">{formatToduClientError(error)}</Text> : null}
    </Pane>
  );
}

function formatDetailLoadingLabel({
  isLoadingDetail,
  isLoadingComments,
}: {
  isLoadingDetail: boolean;
  isLoadingComments: boolean;
}): string | null {
  if (isLoadingDetail && isLoadingComments) {
    return "loading detail + comments…";
  }

  if (isLoadingDetail) {
    return "loading detail…";
  }

  if (isLoadingComments) {
    return "loading comments…";
  }

  return null;
}
