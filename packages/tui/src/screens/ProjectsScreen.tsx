import { useQuery } from "@tanstack/react-query";
import type { Project } from "@todu/core";
import { Box, Text, useInput, useStdout } from "ink";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { ListFilterModal } from "../components/ListFilterModal.js";
import { Pane } from "../components/Pane.js";
import { getVisibleTaskWindow } from "../components/tasks/TaskListPane.js";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import {
  createProjectListQuery,
  defaultProjectListFilter,
  formatProjectListFilter,
  matchesPriority,
  type ProjectListFilterState,
} from "../state/list-filter.js";
import { formatListWindowIndicator, type ListWindow } from "../state/list-window.js";
import type { ProjectFilterState } from "../state/project-filter.js";
import { queryKeys } from "../state/query-keys.js";

const ALL_PROJECTS_OPTION_ID = "__all__";
const PROJECT_LIST_PANE_WIDTH_PERCENT = 0.4;
const PROJECT_LIST_PANE_WIDTH = "40%";
const PROJECT_DETAIL_PANE_WIDTH = "60%";
const MIN_PROJECT_LABEL_LENGTH = 8;
const MIN_VISIBLE_PROJECTS = 1;

const projectStatusOptions = [
  { value: "active", label: "Active" },
  { value: "done", label: "Done" },
  { value: "canceled", label: "Canceled" },
] as const;

interface ProjectOption {
  id: string;
  label: string;
  project: Project | null;
}

export interface ProjectsScreenProps {
  client: TuiToduClient;
  projectFilter: ProjectFilterState;
  listFilter?: ProjectListFilterState;
  onListFilterChange?: (filter: ProjectListFilterState) => void;
  onSelectProject: (project: Project) => void;
  onSelectAllProjects: () => void;
  onGlobalInputEnabledChange?: (enabled: boolean) => void;
  dataQueriesEnabled?: boolean;
}

export function ProjectsScreen({
  client,
  projectFilter,
  listFilter: listFilterProp,
  onListFilterChange,
  onSelectProject,
  onSelectAllProjects,
  onGlobalInputEnabledChange,
  dataQueriesEnabled = true,
}: ProjectsScreenProps): JSX.Element {
  const listFilter = listFilterProp ?? defaultProjectListFilter;
  const { stdout } = useStdout();
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    projectFilter.projectId ?? ALL_PROJECTS_OPTION_ID,
  );
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const projectListQuery = createProjectListQuery(listFilter);
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(projectListQuery),
    queryFn: () => client.project.list(projectListQuery),
    enabled: dataQueriesEnabled,
  });
  const projectOptions = useMemo(
    () =>
      createProjectOptions(
        (projectsQuery.data ?? []).filter((project) =>
          matchesPriority(project.priority, listFilter),
        ),
      ),
    [listFilter, projectsQuery.data],
  );
  const selectedOption =
    projectOptions.find((option) => option.id === selectedOptionId) ?? projectOptions[0];
  const maxVisibleProjects = resolveMaxVisibleProjects(stdout.rows);
  const maxProjectLabelLength = resolveProjectLabelLength(stdout.columns);
  const projectWindow = getVisibleTaskWindow(
    projectOptions,
    selectedOption?.id ?? selectedOptionId,
    maxVisibleProjects,
  );

  useEffect(() => {
    onGlobalInputEnabledChange?.(!filterModalOpen);
    return () => onGlobalInputEnabledChange?.(true);
  }, [filterModalOpen, onGlobalInputEnabledChange]);

  useEffect(() => {
    if (!projectsQuery.data) {
      return;
    }

    setSelectedOptionId((current) => resolveProjectOptionId(projectOptions, current));
  }, [projectOptions, projectsQuery.data]);

  useInput((input, key) => {
    if (filterModalOpen) {
      return;
    }

    if (key.ctrl && input === "f") {
      setFilterModalOpen(true);
      return;
    }

    if (input === "a") {
      onSelectAllProjects();
      return;
    }

    if (input === "\r") {
      if (selectedOption?.project) {
        onSelectProject(selectedOption.project);
        return;
      }

      onSelectAllProjects();
      return;
    }

    if (input === "j" || key.downArrow) {
      setSelectedOptionId((current) => moveProjectOption(projectOptions, current, "next"));
      return;
    }

    if (input === "k" || key.upArrow) {
      setSelectedOptionId((current) => moveProjectOption(projectOptions, current, "previous"));
    }
  });

  const projectCount = projectsQuery.data?.length ?? 0;
  const listTitle = projectsQuery.isLoading
    ? "Projects • loading…"
    : `Projects (${projectCount}) • ${formatProjectListFilter(listFilter)}`;

  if (filterModalOpen) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <ListFilterModal
          title="Filter projects"
          statusOptions={projectStatusOptions}
          initialFilter={listFilter}
          onApply={(filter) => {
            onListFilterChange?.(filter);
            setFilterModalOpen(false);
          }}
          onCancel={() => setFilterModalOpen(false)}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="row" flexGrow={1}>
      <Pane title={listTitle} width={PROJECT_LIST_PANE_WIDTH} focused>
        <ProjectListContent
          error={projectsQuery.error}
          isLoading={projectsQuery.isLoading}
          projectWindow={projectWindow}
          selectedOptionId={selectedOption?.id ?? selectedOptionId}
          maxProjectLabelLength={maxProjectLabelLength}
        />
      </Pane>
      <Pane title="Project detail" width={PROJECT_DETAIL_PANE_WIDTH}>
        <ProjectDetailContent
          option={selectedOption}
          activeFilter={projectFilter}
          error={projectsQuery.error}
          isLoading={projectsQuery.isLoading}
          isEmpty={!projectsQuery.isLoading && !projectsQuery.error && projectCount === 0}
        />
      </Pane>
      {filterModalOpen ? (
        <ListFilterModal
          title="Filter projects"
          statusOptions={projectStatusOptions}
          initialFilter={listFilter}
          onApply={(filter) => {
            onListFilterChange?.(filter);
            setFilterModalOpen(false);
          }}
          onCancel={() => setFilterModalOpen(false)}
        />
      ) : null}
    </Box>
  );
}

function ProjectListContent({
  error,
  isLoading,
  projectWindow,
  selectedOptionId,
  maxProjectLabelLength,
}: {
  error: unknown;
  isLoading: boolean;
  projectWindow: ListWindow<ProjectOption>;
  selectedOptionId: string;
  maxProjectLabelLength: number;
}): JSX.Element {
  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Projects unavailable</Text>
        <Text color="gray" wrap="truncate-end">
          {formatToduClientError(error)}
        </Text>
      </Box>
    );
  }

  if (isLoading) {
    return <Text color="gray">Loading projects…</Text>;
  }

  if (projectWindow.total === 1 && projectWindow.items[0]?.id === ALL_PROJECTS_OPTION_ID) {
    return (
      <Box flexDirection="column">
        <Text color="gray">No projects available.</Text>
        <Text color="gray">Press a to show tasks from all projects.</Text>
      </Box>
    );
  }

  const aboveIndicator = formatListWindowIndicator(projectWindow, "above");
  const belowIndicator = formatListWindowIndicator(projectWindow, "below");

  return (
    <Box flexDirection="column">
      {aboveIndicator ? <Text color="gray">{aboveIndicator}</Text> : null}
      {projectWindow.items.map((option) => {
        const selected = option.id === selectedOptionId;
        return (
          <Text
            key={option.id}
            color={selected ? "cyan" : undefined}
            inverse={selected}
            wrap="truncate-end"
          >
            {selected ? ">" : " "} {truncateProjectLabel(option.label, maxProjectLabelLength)}
          </Text>
        );
      })}
      {belowIndicator ? <Text color="gray">{belowIndicator}</Text> : null}
    </Box>
  );
}

function ProjectDetailContent({
  option,
  activeFilter,
  error,
  isLoading,
  isEmpty,
}: {
  option: ProjectOption | undefined;
  activeFilter: ProjectFilterState;
  error: unknown;
  isLoading: boolean;
  isEmpty: boolean;
}): JSX.Element {
  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Projects unavailable</Text>
        <Text color="gray" wrap="truncate-end">
          {formatToduClientError(error)}
        </Text>
      </Box>
    );
  }

  if (isLoading) {
    return <Text color="gray">Project details will appear after projects load.</Text>;
  }

  if (isEmpty || !option?.project) {
    return (
      <Box flexDirection="column">
        <Text color="gray">All projects</Text>
        <Text color="gray">Press Enter or a to show tasks from every project.</Text>
        <Text color="gray">Current filter: {activeFilter.projectName ?? "All projects"}</Text>
      </Box>
    );
  }

  const project = option.project;
  return (
    <Box flexDirection="column">
      <Text color="white" wrap="truncate-end">
        {project.name}
      </Text>
      <Text color="gray">Status: {project.status}</Text>
      <Text color="gray">Priority: {project.priority}</Text>
      {project.description ? (
        <Text color="gray" wrap="truncate-end">
          {project.description}
        </Text>
      ) : null}
      <Text color="gray">Press Enter to filter Tasks by this project.</Text>
      <Text color="gray">Press a for all projects.</Text>
    </Box>
  );
}

function resolveProjectLabelLength(columns: number | undefined): number {
  const terminalColumns = columns && columns > 0 ? columns : 80;
  const appHorizontalPadding = 2;
  const paneBorderAndPadding = 4;
  const selectionPrefix = 2;
  const availableBodyColumns = Math.max(0, terminalColumns - appHorizontalPadding);
  const projectPaneColumns = Math.floor(availableBodyColumns * PROJECT_LIST_PANE_WIDTH_PERCENT);

  return Math.max(
    MIN_PROJECT_LABEL_LENGTH,
    projectPaneColumns - paneBorderAndPadding - selectionPrefix,
  );
}

function resolveMaxVisibleProjects(rows: number | undefined): number {
  const terminalRows = rows && rows > 0 ? rows : 24;

  // AppFrame reserves rows for padding, title, status, body margins, and footer.
  // Bordered panes and potential above/below indicators reserve four more rows.
  return Math.max(MIN_VISIBLE_PROJECTS, terminalRows - 12);
}

function truncateProjectLabel(label: string, maxLength = 24): string {
  if (label.length <= maxLength) {
    return label;
  }

  if (maxLength <= 3) {
    return label.slice(0, maxLength);
  }

  return `${label.slice(0, maxLength - 3)}...`;
}

export function createProjectOptions(projects: readonly Project[]): ProjectOption[] {
  return [
    { id: ALL_PROJECTS_OPTION_ID, label: "All projects", project: null },
    ...projects.map((project) => ({ id: project.id, label: project.name, project })),
  ];
}

export function resolveProjectOptionId(
  options: readonly ProjectOption[],
  currentOptionId: string,
): string {
  if (options.some((option) => option.id === currentOptionId)) {
    return currentOptionId;
  }

  return options[0]?.id ?? ALL_PROJECTS_OPTION_ID;
}

export function moveProjectOption(
  options: readonly ProjectOption[],
  currentOptionId: string,
  direction: "next" | "previous",
): string {
  if (options.length === 0) {
    return ALL_PROJECTS_OPTION_ID;
  }

  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.id === currentOptionId),
  );
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + delta));
  return options[nextIndex]?.id ?? ALL_PROJECTS_OPTION_ID;
}
