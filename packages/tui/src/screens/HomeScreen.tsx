import { useQuery } from "@tanstack/react-query";
import type { Project, Task } from "@todu/core";
import { Box, Text, useInput, useStdout } from "ink";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { Pane } from "../components/Pane.js";
import { getVisibleTaskWindow } from "../components/tasks/TaskListPane.js";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import { formatTaskPriority } from "../formatting/priority.js";
import {
  createHomeProjectFocus,
  createHomeTaskSections,
  localDateString,
} from "../state/home-sections.js";
import { formatListWindowIndicator } from "../state/list-window.js";
import { queryKeys } from "../state/query-keys.js";
import { moveSelection, resolveSelectedId } from "../state/selection.js";

const taskSectionOrder = ["now", "thisWeek", "waiting"] as const;
const homeSectionOrder = [...taskSectionOrder, "projectFocus"] as const;

type HomeSection = (typeof homeSectionOrder)[number];

type HomeRow =
  | { id: string; kind: "header"; section: HomeSection; title: string; count: number }
  | { id: string; kind: "task"; section: HomeSection; task: Task }
  | { id: string; kind: "project"; section: "projectFocus"; project: Project }
  | { id: string; kind: "message"; section: HomeSection; message: string; tone: "error" | "muted" };

export interface HomeScreenProps {
  client: TuiToduClient;
  dataQueriesEnabled?: boolean;
  today?: string;
  onOpenTask?: (task: Task) => void;
  onSelectProject?: (project: Project) => void;
}

export function HomeScreen({
  client,
  dataQueriesEnabled = true,
  today = localDateString(),
  onOpenTask,
  onSelectProject,
}: HomeScreenProps): JSX.Element {
  const { stdout } = useStdout();
  const [focusedSection, setFocusedSection] = useState<HomeSection>("now");
  const [selectedItemIds, setSelectedItemIds] = useState<Record<HomeSection, string | null>>({
    now: null,
    thisWeek: null,
    waiting: null,
    projectFocus: null,
  });
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks({ status: ["active", "inprogress", "waiting"] }),
    queryFn: () => client.task.list({ status: ["active", "inprogress", "waiting"] }),
    enabled: dataQueriesEnabled,
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => client.project.list(),
    enabled: dataQueriesEnabled,
  });
  const focusedProjects = useMemo(
    () => createHomeProjectFocus(projectsQuery.data ?? []),
    [projectsQuery.data],
  );
  const taskSections = useMemo(
    () => createHomeTaskSections(tasksQuery.data ?? [], today),
    [tasksQuery.data, today],
  );
  const sectionItems: Record<HomeSection, readonly (Task | Project)[]> = {
    ...taskSections,
    projectFocus: focusedProjects,
  };
  const effectiveSelectedItemIds = {
    now: resolveSelectedId(taskSections.now, selectedItemIds.now),
    thisWeek: resolveSelectedId(taskSections.thisWeek, selectedItemIds.thisWeek),
    waiting: resolveSelectedId(taskSections.waiting, selectedItemIds.waiting),
    projectFocus: resolveSelectedId(focusedProjects, selectedItemIds.projectFocus),
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
      const selectedId = effectiveSelectedItemIds[focusedSection];
      if (focusedSection === "projectFocus") {
        const project = focusedProjects.find((project) => project.id === selectedId);
        if (project) {
          onSelectProject?.(project);
        }
      } else {
        const task = taskSections[focusedSection].find((task) => task.id === selectedId);
        if (task) {
          onOpenTask?.(task);
        }
      }
      return;
    }

    const direction =
      input === "j" || key.downArrow ? "next" : input === "k" || key.upArrow ? "previous" : null;
    if (!direction) {
      return;
    }

    const items = sectionItems[focusedSection];
    setSelectedItemIds((current) => ({
      ...current,
      [focusedSection]: moveSelection(items, current[focusedSection], direction),
    }));
  });

  const homeRows = [
    ...(tasksQuery.isPending ? [] : createHomeTaskRows(taskSections, tasksQuery.error)),
    ...createProjectFocusRows({
      projects: focusedProjects,
      query: projectsQuery,
      dataQueriesEnabled,
    }),
  ];
  const status =
    tasksQuery.isError || projectsQuery.isError
      ? "failed"
      : tasksQuery.isPending || projectsQuery.isPending
        ? "loading…"
        : tasksQuery.isFetching || projectsQuery.isFetching
          ? "refreshing…"
          : "ready";
  const selectedItemId = effectiveSelectedItemIds[focusedSection];
  const itemKind = focusedSection === "projectFocus" ? "project" : "task";
  const activeRowId = selectedItemId ? `${itemKind}:${selectedItemId}` : `header:${focusedSection}`;
  const homeWindow = getVisibleTaskWindow(
    homeRows,
    activeRowId,
    resolveHomeViewportRows(stdout.rows, tasksQuery.isPending ? 1 : 0),
  );
  const aboveIndicator = formatListWindowIndicator(homeWindow, "above");
  const belowIndicator = formatListWindowIndicator(homeWindow, "below");

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Pane title={`Home • ${status}`} width="100%" focused>
        {tasksQuery.isPending ? (
          <Text color="yellow">
            {dataQueriesEnabled
              ? "Loading tasks from local daemon…"
              : "Waiting for daemon connection…"}
          </Text>
        ) : null}
        {aboveIndicator ? <Text color="gray">{aboveIndicator}</Text> : null}
        {homeWindow.items.map((row) => (
          <HomeRowLine
            key={row.id}
            row={row}
            focusedSection={focusedSection}
            selectedItemIds={effectiveSelectedItemIds}
          />
        ))}
        {belowIndicator ? <Text color="gray">{belowIndicator}</Text> : null}
      </Pane>
    </Box>
  );
}

function createHomeTaskRows(
  taskSections: ReturnType<typeof createHomeTaskSections>,
  taskError: Error | null,
): HomeRow[] {
  const rows: HomeRow[] = [];
  for (const section of taskSectionOrder) {
    const tasks = taskSections[section];
    rows.push({
      id: `header:${section}`,
      kind: "header",
      section,
      title: section === "now" ? "Now" : section === "thisWeek" ? "This Week" : "Waiting",
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

function createProjectFocusRows({
  projects,
  query,
  dataQueriesEnabled,
}: {
  projects: readonly Project[];
  query: { isPending: boolean; error: Error | null };
  dataQueriesEnabled: boolean;
}): HomeRow[] {
  const section = "projectFocus";
  const rows: HomeRow[] = [
    {
      id: `header:${section}`,
      kind: "header",
      section,
      title: "Project Focus",
      count: projects.length,
    },
  ];
  const message = query.error
    ? `Projects unavailable: ${formatToduClientError(query.error)}`
    : query.isPending
      ? dataQueriesEnabled
        ? "Loading projects from local daemon…"
        : "Waiting for daemon connection…"
      : projects.length === 0
        ? "No focused projects."
        : null;
  if (message) {
    rows.push({
      id: `message:${section}`,
      kind: "message",
      section,
      message,
      tone: query.error ? "error" : "muted",
    });
  }
  rows.push(
    ...projects.map(
      (project): HomeRow => ({
        id: `project:${project.id}`,
        kind: "project",
        section,
        project,
      }),
    ),
  );
  return rows;
}

function HomeRowLine({
  row,
  focusedSection,
  selectedItemIds,
}: {
  row: HomeRow;
  focusedSection: HomeSection;
  selectedItemIds: Record<HomeSection, string | null>;
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

  const item = row.kind === "project" ? row.project : row.task;
  const title = row.kind === "project" ? row.project.name : row.task.title;
  const selected = row.section === focusedSection && selectedItemIds[row.section] === item.id;
  const content = (
    <Text color={selected ? "cyan" : undefined} inverse={selected} wrap="truncate-end">
      {selected ? ">" : " "} • {title}
    </Text>
  );
  if (row.kind === "project") {
    return content;
  }

  return (
    <Box height={1} flexShrink={0} width="100%">
      <Box flexGrow={1} flexShrink={1} flexBasis={0} minWidth={0}>
        {content}
      </Box>
      <Box width={7} flexShrink={0}>
        <Text color={selected ? "cyan" : undefined} inverse={selected} wrap="truncate-end">
          {` [${formatTaskPriority(row.task.priority)}]`}
        </Text>
      </Box>
    </Box>
  );
}

export function moveHomeSection(current: HomeSection, direction: "next" | "previous"): HomeSection {
  const currentIndex = homeSectionOrder.indexOf(current);
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(homeSectionOrder.length - 1, currentIndex + delta));
  return homeSectionOrder[nextIndex] ?? current;
}

function resolveHomeViewportRows(rows: number | undefined, loadingRows: number): number {
  const terminalRows = rows && rows > 0 ? rows : 24;
  // AppFrame uses eight rows; pane borders/title use three; scroll indicators need two.
  return Math.max(1, terminalRows - 13 - loadingRows);
}
