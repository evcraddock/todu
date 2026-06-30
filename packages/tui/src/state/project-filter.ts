import type { Project, ProjectId } from "@todu/core";

export interface ProjectFilterState {
  projectId: ProjectId | null;
  projectName: string | null;
}

export const allProjectsFilter: ProjectFilterState = {
  projectId: null,
  projectName: null,
};

export function createProjectFilter(project: Project): ProjectFilterState {
  return {
    projectId: project.id,
    projectName: project.name,
  };
}

export function describeProjectFilter(filter: ProjectFilterState): string {
  return filter.projectName ?? "All projects";
}
