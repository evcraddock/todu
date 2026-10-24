import type { ProjectFilter } from "@todu/core/browser";
import { type ReactNode, useEffect, useState } from "react";
import { CreateProjectDialog } from "./CreateProjectDialog.js";
import { CreateTaskDialog } from "./CreateTaskDialog.js";
import { ProjectDetail } from "./ProjectDetail.js";
import { ProjectList } from "./ProjectList.js";
import { TaskDetail } from "./TaskDetail.js";

type ProjectViewState =
  | { view: "list" }
  | { view: "detail"; projectId: string; returnToHome?: boolean }
  | { view: "create" }
  | { view: "createTask"; projectId: string; returnToHome?: boolean }
  | { view: "taskDetail"; taskId: string; projectId: string; returnToHome?: boolean };

export function ProjectsView({
  externalFilter,
  focusProjectId,
  onFocusConsumed,
  returnToHome,
  onNavigateHome,
}: {
  externalFilter?: ProjectFilter | null;
  focusProjectId?: string | null;
  onFocusConsumed?: () => void;
  returnToHome?: boolean;
  onNavigateHome?: () => void;
}): ReactNode {
  const [state, setState] = useState<ProjectViewState>(
    focusProjectId ? { view: "detail", projectId: focusProjectId, returnToHome } : { view: "list" },
  );

  useEffect(() => {
    if (focusProjectId) {
      setState({ view: "detail", projectId: focusProjectId, returnToHome });
      onFocusConsumed?.();
    }
  }, [focusProjectId, onFocusConsumed, returnToHome]);

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
          backLabel={state.returnToHome && onNavigateHome ? "Overview" : "Projects"}
          onBack={() => {
            if (state.returnToHome && onNavigateHome) onNavigateHome();
            else setState({ view: "list" });
          }}
          onSelectTask={(taskId) =>
            setState({
              view: "taskDetail",
              taskId,
              projectId: state.projectId,
              returnToHome: state.returnToHome,
            })
          }
          onCreateTask={(projectId) =>
            setState({ view: "createTask", projectId, returnToHome: state.returnToHome })
          }
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
            backLabel={state.returnToHome && onNavigateHome ? "Overview" : "Projects"}
            onBack={() => {
              if (state.returnToHome && onNavigateHome) onNavigateHome();
              else setState({ view: "list" });
            }}
            onSelectTask={(taskId) =>
              setState({
                view: "taskDetail",
                taskId,
                projectId: state.projectId,
                returnToHome: state.returnToHome,
              })
            }
            onCreateTask={(projectId) =>
              setState({ view: "createTask", projectId, returnToHome: state.returnToHome })
            }
          />
          <CreateTaskDialog
            onClose={() =>
              setState({
                view: "detail",
                projectId: state.projectId,
                returnToHome: state.returnToHome,
              })
            }
            defaultProjectId={state.projectId}
          />
        </>
      );

    case "taskDetail":
      return (
        <TaskDetail
          taskId={state.taskId}
          onBack={() =>
            setState({
              view: "detail",
              projectId: state.projectId,
              returnToHome: state.returnToHome,
            })
          }
        />
      );
  }
}
