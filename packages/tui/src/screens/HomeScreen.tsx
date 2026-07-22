import { useQuery } from "@tanstack/react-query";
import type { Task } from "@todu/core";
import { Box, Text, useInput, useStdout } from "ink";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { Pane } from "../components/Pane.js";
import { getVisibleTaskWindow } from "../components/tasks/TaskListPane.js";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import { createHomeTaskSections, localDateString } from "../state/home-sections.js";
import { formatListWindowIndicator } from "../state/list-window.js";
import { queryKeys } from "../state/query-keys.js";
import { moveSelection, resolveSelectedId } from "../state/selection.js";

const homeSectionOrder = ["now", "next", "waiting"] as const;

type HomeSection = (typeof homeSectionOrder)[number];

type HomeRow =
  | { id: string; kind: "header"; section: HomeSection; title: string; count: number }
  | { id: string; kind: "task"; section: HomeSection; task: Task }
  | { id: string; kind: "message"; section: HomeSection; message: string; tone: "error" | "muted" };

export interface HomeScreenProps {
  client: TuiToduClient;
  dataQueriesEnabled?: boolean;
  today?: string;
  onOpenTask?: (task: Task) => void;
}

export function HomeScreen({
  client,
  dataQueriesEnabled = true,
  today = localDateString(),
  onOpenTask,
}: HomeScreenProps): JSX.Element {
  const { stdout } = useStdout();
  const [focusedSection, setFocusedSection] = useState<HomeSection>("now");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Record<HomeSection, string | null>>({
    now: null,
    next: null,
    waiting: null,
  });
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks({ status: ["active", "inprogress", "waiting"] }),
    queryFn: () => client.task.list({ status: ["active", "inprogress", "waiting"] }),
    enabled: dataQueriesEnabled,
  });
  const taskSections = useMemo(
    () => createHomeTaskSections(tasksQuery.data ?? [], today),
    [tasksQuery.data, today],
  );
  const effectiveSelectedTaskIds = {
    now: resolveSelectedId(taskSections.now, selectedTaskIds.now),
    next: resolveSelectedId(taskSections.next, selectedTaskIds.next),
    waiting: resolveSelectedId(taskSections.waiting, selectedTaskIds.waiting),
  };

  useInput((input, key) => {
    const normalizedInput = input.toLowerCase();
    if (key.shift && (normalizedInput === "j" || normalizedInput === "k")) {
      setFocusedSection((current) =>
        moveHomeSection(current, normalizedInput === "j" ? "next" : "previous"),
      );
      return;
    }

    if (key.ctrl || key.shift) {
      return;
    }

    if (key.return || input === "\r") {
      const selectedTaskId = effectiveSelectedTaskIds[focusedSection];
      const selectedTask = taskSections[focusedSection].find((task) => task.id === selectedTaskId);
      if (selectedTask) {
        onOpenTask?.(selectedTask);
      }
      return;
    }

    const direction =
      input === "j" || key.downArrow ? "next" : input === "k" || key.upArrow ? "previous" : null;
    if (!direction) {
      return;
    }

    const tasks = taskSections[focusedSection];
    setSelectedTaskIds((current) => ({
      ...current,
      [focusedSection]: moveSelection(tasks, current[focusedSection], direction),
    }));
  });

  const homeRows = createHomeRows(taskSections, tasksQuery.error);
  const selectedTaskId = effectiveSelectedTaskIds[focusedSection];
  const activeRowId = selectedTaskId ? `task:${selectedTaskId}` : `header:${focusedSection}`;
  const homeWindow = getVisibleTaskWindow(
    homeRows,
    activeRowId,
    resolveHomeViewportRows(stdout.rows),
  );
  const aboveIndicator = formatListWindowIndicator(homeWindow, "above");
  const belowIndicator = formatListWindowIndicator(homeWindow, "below");

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Pane title={`Home${tasksQuery.isLoading ? " • loading…" : ""}`} width="100%" focused>
        {aboveIndicator ? <Text color="gray">{aboveIndicator}</Text> : null}
        {homeWindow.items.map((row) => (
          <HomeRowLine
            key={row.id}
            row={row}
            focusedSection={focusedSection}
            selectedTaskIds={effectiveSelectedTaskIds}
          />
        ))}
        {belowIndicator ? <Text color="gray">{belowIndicator}</Text> : null}
      </Pane>
    </Box>
  );
}

function createHomeRows(
  taskSections: ReturnType<typeof createHomeTaskSections>,
  taskError: Error | null,
): HomeRow[] {
  const rows: HomeRow[] = [];
  for (const section of homeSectionOrder) {
    const tasks = taskSections[section];
    rows.push({
      id: `header:${section}`,
      kind: "header",
      section,
      title: section === "now" ? "Now" : section === "next" ? "Next" : "Waiting",
      count: tasks.length,
    });
    if (section === "now" && taskError) {
      rows.push({
        id: "message:tasks-error",
        kind: "message",
        section,
        message: `Tasks unavailable: ${formatToduClientError(taskError)}`,
        tone: "error",
      });
    } else if (!taskError && tasks.length === 0) {
      rows.push({
        id: `message:${section}-empty`,
        kind: "message",
        section,
        message: "No tasks.",
        tone: "muted",
      });
    }
    rows.push(
      ...tasks.map((task) => ({ id: `task:${task.id}`, kind: "task" as const, section, task })),
    );
  }

  return rows;
}

function HomeRowLine({
  row,
  focusedSection,
  selectedTaskIds,
}: {
  row: HomeRow;
  focusedSection: HomeSection;
  selectedTaskIds: Record<HomeSection, string | null>;
}): JSX.Element {
  if (row.kind === "header") {
    const focused = row.section === focusedSection;
    return (
      <Text color={focused ? "cyan" : "white"} bold>
        {focused ? "> " : "  "}
        {row.title} ({row.count})
      </Text>
    );
  }

  if (row.kind === "message") {
    return <Text color={row.tone === "error" ? "red" : "gray"}> {row.message}</Text>;
  }

  const selected = row.section === focusedSection && selectedTaskIds[row.section] === row.task.id;
  return (
    <Text color={selected ? "cyan" : undefined} inverse={selected} wrap="truncate-end">
      {selected ? ">" : " "} • {row.task.title}
    </Text>
  );
}

export function moveHomeSection(current: HomeSection, direction: "next" | "previous"): HomeSection {
  const currentIndex = homeSectionOrder.indexOf(current);
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(homeSectionOrder.length - 1, currentIndex + delta));
  return homeSectionOrder[nextIndex] ?? current;
}

function resolveHomeViewportRows(rows: number | undefined): number {
  const terminalRows = rows && rows > 0 ? rows : 24;
  return Math.max(4, terminalRows - 12);
}
