import type { Note, Project, Task, TaskWithDetail } from "@todu/core";
import { Text, useInput } from "ink";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { formatToduClientError } from "../../daemon/todu-client.js";
import { createProjectNameMap, formatTaskMetadata } from "../../formatting/task.js";
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
  maxContentWidth?: number;
  maxContentRows?: number;
  scrollEnabled?: boolean;
}

export interface TaskDetailLine {
  id: string;
  text: string;
  color: "cyan" | "gray" | "white";
  bold?: boolean;
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
  maxContentWidth = 60,
  maxContentRows = 12,
  scrollEnabled = false,
}: TaskDetailPaneProps): JSX.Element {
  const projectNames = createProjectNameMap(projects);
  const detailTask = detail ?? task;
  const loadingLabel = formatDetailLoadingLabel({ isLoadingDetail, isLoadingComments });
  const detailLines = detailTask
    ? createTaskDetailLines({
        task: detailTask,
        projectName: projectNames.get(detailTask.projectId) ?? null,
        comments,
        maxContentWidth,
      })
    : [];
  const errorLine: TaskDetailLine | null = error
    ? {
        id: "error",
        text: formatToduClientError(error),
        color: "gray",
      }
    : null;
  const allLines = errorLine ? [...detailLines, errorLine] : detailLines;
  const visibleContentRows = Math.max(1, maxContentRows - 2);
  const maxScrollOffset = Math.max(0, allLines.length - visibleContentRows);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    setScrollOffset((current) => Math.min(current, maxScrollOffset));
  }, [maxScrollOffset]);

  useInput(
    (input, key) => {
      if (input === "j" || key.downArrow) {
        setScrollOffset((current) => Math.min(maxScrollOffset, current + 1));
        return;
      }

      if (input === "k" || key.upArrow) {
        setScrollOffset((current) => Math.max(0, current - 1));
      }
    },
    { isActive: scrollEnabled },
  );

  const visibleLines = allLines.slice(scrollOffset, scrollOffset + visibleContentRows);
  const hiddenBelow = Math.max(0, allLines.length - (scrollOffset + visibleContentRows));

  return (
    <Pane title={`Task detail${loadingLabel ? ` • ${loadingLabel}` : ""}`} width={width} focused>
      {!detailTask ? <Text color="gray">No task selected.</Text> : null}
      {scrollOffset > 0 ? <Text color="gray">↑ {scrollOffset} lines</Text> : null}
      {visibleLines.map((line) => (
        <Text key={line.id} color={line.color} bold={line.bold} wrap="wrap">
          {line.text}
        </Text>
      ))}
      {hiddenBelow > 0 ? <Text color="gray">↓ {hiddenBelow} lines</Text> : null}
    </Pane>
  );
}

export function createTaskDetailLines({
  task,
  projectName,
  comments,
  maxContentWidth,
}: {
  task: TaskWithDetail | Task;
  projectName: string | null;
  comments: readonly Note[];
  maxContentWidth: number;
}): readonly TaskDetailLine[] {
  const contentWidth = Math.max(1, maxContentWidth);
  const description = "description" in task ? (task.description?.trim() ?? "") : "";
  const lines: TaskDetailLine[] = [
    ...createWrappedLines("title", task.title, contentWidth, "white", true),
    { id: "description-heading", text: "Description", color: "cyan" },
    ...createWrappedLines(
      "description",
      description || "No description.",
      contentWidth,
      description ? "white" : "gray",
    ),
    { id: "metadata-heading", text: "Metadata", color: "cyan" },
    ...createWrappedLines("metadata", formatTaskMetadata(task, projectName), contentWidth, "gray"),
    { id: "comments-heading", text: "Comments", color: "cyan" },
  ];

  if (comments.length === 0) {
    lines.push({ id: "comments-empty", text: "No comments.", color: "gray" });
    return lines;
  }

  for (const comment of comments) {
    const label = comment.author ? `${comment.author}: ${comment.content}` : comment.content;
    lines.push(...createWrappedLines(`comment-${comment.id}`, label, contentWidth, "white"));
  }

  return lines;
}

function createWrappedLines(
  id: string,
  value: string,
  maxWidth: number,
  color: TaskDetailLine["color"],
  bold = false,
): readonly TaskDetailLine[] {
  return wrapText(value.replace(/\s+/g, " ").trim(), maxWidth).map((text, index) => ({
    id: `${id}-${index}`,
    text,
    color,
    bold,
  }));
}

function wrapText(value: string, maxWidth: number): readonly string[] {
  if (value.length <= maxWidth) {
    return [value];
  }

  const lines: string[] = [];
  let remaining = value;
  while (remaining.length > maxWidth) {
    const splitAt = remaining.lastIndexOf(" ", maxWidth);
    const lineEnd = splitAt > 0 ? splitAt : maxWidth;
    lines.push(remaining.slice(0, lineEnd));
    remaining = remaining.slice(lineEnd).trimStart();
  }
  lines.push(remaining);

  return lines;
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
