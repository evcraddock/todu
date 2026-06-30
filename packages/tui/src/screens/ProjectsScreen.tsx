import { useQuery } from "@tanstack/react-query";
import type { Project } from "@todu/core";
import { Box, Text, useInput } from "ink";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import type { ProjectFilterState } from "../state/project-filter.js";
import { queryKeys } from "../state/query-keys.js";

const ALL_PROJECTS_OPTION_ID = "__all__";

interface ProjectOption {
  id: string;
  label: string;
  project: Project | null;
}

export interface ProjectsScreenProps {
  client: TuiToduClient;
  projectFilter: ProjectFilterState;
  onSelectProject: (project: Project) => void;
  onSelectAllProjects: () => void;
}

export function ProjectsScreen({
  client,
  projectFilter,
  onSelectProject,
  onSelectAllProjects,
}: ProjectsScreenProps): JSX.Element {
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    projectFilter.projectId ?? ALL_PROJECTS_OPTION_ID,
  );
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => client.project.list(),
  });
  const projectOptions = useMemo(
    () => createProjectOptions(projectsQuery.data ?? []),
    [projectsQuery.data],
  );
  const selectedOption =
    projectOptions.find((option) => option.id === selectedOptionId) ?? projectOptions[0];

  useEffect(() => {
    if (!projectsQuery.data) {
      return;
    }

    setSelectedOptionId((current) => resolveProjectOptionId(projectOptions, current));
  }, [projectOptions, projectsQuery.data]);

  useInput((input, key) => {
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

  if (projectsQuery.error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Projects unavailable</Text>
        <Text color="gray">{formatToduClientError(projectsQuery.error)}</Text>
      </Box>
    );
  }

  if (projectsQuery.isLoading) {
    return <Text color="yellow">Loading projects…</Text>;
  }

  if ((projectsQuery.data ?? []).length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="cyan">Projects</Text>
        <Text color="gray">No projects available.</Text>
        <Text color="gray">Press a to show tasks from all projects.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row">
      <Box flexDirection="column" width="50%" paddingRight={1}>
        <Text color="cyan">Projects ({projectsQuery.data?.length ?? 0})</Text>
        {projectOptions.map((option) => {
          const selected = option.id === selectedOption?.id;
          return (
            <Text
              key={option.id}
              color={selected ? "cyan" : undefined}
              inverse={selected}
              wrap="truncate-end"
            >
              {selected ? ">" : " "} {option.label}
            </Text>
          );
        })}
      </Box>
      <ProjectDetail option={selectedOption} activeFilter={projectFilter} />
    </Box>
  );
}

function ProjectDetail({
  option,
  activeFilter,
}: {
  option: ProjectOption | undefined;
  activeFilter: ProjectFilterState;
}): JSX.Element {
  if (!option?.project) {
    return (
      <Box flexDirection="column" width="50%" paddingLeft={1}>
        <Text color="cyan">Project detail</Text>
        <Text color="gray">All projects</Text>
        <Text color="gray">Press Enter or a to show tasks from every project.</Text>
        <Text color="gray">Current filter: {activeFilter.projectName ?? "All projects"}</Text>
      </Box>
    );
  }

  const project = option.project;
  return (
    <Box flexDirection="column" width="50%" paddingLeft={1}>
      <Text color="cyan">Project detail</Text>
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
