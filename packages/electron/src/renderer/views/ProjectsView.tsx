import { type ReactNode, useState } from "react";
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

export function ProjectsView(): ReactNode {
  const [state, setState] = useState<ProjectViewState>({ view: "list" });

  switch (state.view) {
    case "list":
      return (
        <>
          <ProjectList
            onSelectProject={(id) => setState({ view: "detail", projectId: id })}
            onCreateProject={() => setState({ view: "create" })}
          />
        </>
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
