import type { ProjectFilter } from "@todu/core/browser";
import { type ReactNode, useEffect, useState } from "react";
import { CreateProjectDialog } from "./CreateProjectDialog.js";
import { CreateTaskDialog } from "./CreateTaskDialog.js";
import { ProjectDetail } from "./ProjectDetail.js";
import { ProjectList } from "./ProjectList.js";
import { TaskDetail } from "./TaskDetail.js";

type ProjectViewState =
  | { view: "list" }
  | { view: "detail"; projectId: string }
  | { view: "create" }
  | { view: "createTask"; projectId: string }
  | { view: "taskDetail"; taskId: string; projectId: string };

export function ProjectsView({
  externalFilter,
  focusProjectId,
  onFocusConsumed,
}: {
  externalFilter?: ProjectFilter | null;
  focusProjectId?: string | null;
  onFocusConsumed?: () => void;
}): ReactNode {
  const [state, setState] = useState<ProjectViewState>(
    focusProjectId ? { view: "detail", projectId: focusProjectId } : { view: "list" },
  );

  useEffect(() => {
    if (focusProjectId) {
      setState({ view: "detail", projectId: focusProjectId });
      onFocusConsumed?.();
    }
  }, [focusProjectId, onFocusConsumed]);

  switch (state.view) {
    case "list":
      return (
        <ProjectList
          onSelectProject={(id) => setState({ view: "detail", projectId: id })}
          onCreateProject={() => setState({ view: "create" })}
          externalFilter={externalFilter}
        />
      );

    case "detail":
      return (
        <ProjectDetail
          projectId={state.projectId}
          onBack={() => setState({ view: "list" })}
          onSelectTask={(taskId) =>
            setState({ view: "taskDetail", taskId, projectId: state.projectId })
          }
          onCreateTask={(projectId) => setState({ view: "createTask", projectId })}
        />
      );

    case "create":
      return (
        <>
          <ProjectList
            onSelectProject={(id) => setState({ view: "detail", projectId: id })}
            onCreateProject={() => setState({ view: "create" })}
            externalFilter={externalFilter}
          />
          <CreateProjectDialog onClose={() => setState({ view: "list" })} />
        </>
      );

    case "createTask":
      return (
        <>
          <ProjectDetail
            projectId={state.projectId}
            onBack={() => setState({ view: "list" })}
            onSelectTask={(taskId) =>
              setState({ view: "taskDetail", taskId, projectId: state.projectId })
            }
            onCreateTask={(projectId) => setState({ view: "createTask", projectId })}
          />
          <CreateTaskDialog
            onClose={() => setState({ view: "detail", projectId: state.projectId })}
            defaultProjectId={state.projectId}
          />
        </>
      );

    case "taskDetail":
      return (
        <TaskDetail
          taskId={state.taskId}
          onBack={() => setState({ view: "detail", projectId: state.projectId })}
        />
      );
  }
}
