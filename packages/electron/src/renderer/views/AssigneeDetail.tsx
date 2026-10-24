import type { ProjectFilter, TaskSortOptions } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { EntityIdCopy } from "../components/EntityIdCopy.js";
import { FilterBar } from "../components/FilterBar.js";
import { PriorityChip } from "../components/PriorityChip.js";
import { ProjectFilterBar } from "../components/ProjectFilterBar.js";
import { StatusChip } from "../components/StatusChip.js";
import { TabBar } from "../components/TabBar.js";
import { TaskTable } from "../components/TaskTable.js";
import { useActors, useProjects, useTasks } from "../hooks/useTodu.js";
import { DEFAULT_FILTER, type TaskListFilter } from "../lib/filter-persistence.js";
import { defaultTaskComparator } from "../lib/task-sort.js";
import { CreateTaskDialog } from "./CreateTaskDialog.js";
import { ProjectDetail } from "./ProjectDetail.js";
import { TaskDetail } from "./TaskDetail.js";

const TABS = [
  { id: "projects", label: "Projects" },
  { id: "tasks", label: "Tasks" },
];

export function AssigneeDetail({
  actorId,
  onBack,
  backLabel = "Assignees",
}: {
  actorId: string;
  onBack: () => void;
  backLabel?: string;
}): ReactNode {
  const actors = useActors();
  const [activeTab, setActiveTab] = useState("projects");
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>({ status: "active" });
  const [taskFilter, setTaskFilter] = useState<TaskListFilter>({
    ...DEFAULT_FILTER,
    activeProjects: true,
  });
  const [sort, setSort] = useState<TaskSortOptions>();
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  const [openedTaskId, setOpenedTaskId] = useState<string | null>(null);
  const [openedAssigneeId, setOpenedAssigneeId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const allProjects = useProjects();
  const projects = useProjects(projectFilter);
  const { activeProjects, ...backendTaskFilter } = taskFilter;
  const tasks = useTasks(backendTaskFilter, sort);
  const actor = actors.data?.find((entry) => entry.id === actorId);
  const projectMap = new Map(allProjects.data?.map((project) => [project.id, project.name]));
  const activeIds = new Set(
    allProjects.data?.filter((project) => project.status === "active").map((project) => project.id),
  );
  const assignedProjects = (projects.data ?? [])
    .filter((project) => project.authorizedAssigneeActorIds.some((id) => id === actorId))
    .sort((a, b) => a.name.localeCompare(b.name));
  const assignedTasks = (tasks.data ?? []).filter(
    (task) =>
      task.assigneeActorIds.some((id) => id === actorId) &&
      (!activeProjects || taskFilter.projectId || activeIds.has(task.projectId)),
  );
  if (!sort) assignedTasks.sort(defaultTaskComparator);

  if (openedAssigneeId)
    return (
      <AssigneeDetail
        actorId={openedAssigneeId}
        backLabel="Assignee"
        onBack={() => setOpenedAssigneeId(null)}
      />
    );

  if (openedTaskId)
    return (
      <TaskDetail
        taskId={openedTaskId}
        backLabel={openedProjectId ? "Project" : "Assignee"}
        onBack={() => setOpenedTaskId(null)}
      />
    );
  if (openedProjectId)
    return (
      <>
        <ProjectDetail
          projectId={openedProjectId}
          backLabel="Assignee"
          onBack={() => setOpenedProjectId(null)}
          onSelectTask={setOpenedTaskId}
          onCreateTask={() => setCreatingTask(true)}
        />
        {creatingTask && (
          <CreateTaskDialog
            defaultProjectId={openedProjectId}
            onClose={() => setCreatingTask(false)}
          />
        )}
      </>
    );

  return (
    <div className="view-container entity-detail-view">
      <div className="detail-page-header">
        <div className="detail-toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
            ← {backLabel}
          </button>
        </div>
        <div className="detail-title-row">
          <h2 className="view-title">{actor?.displayName ?? "Assignee"}</h2>
        </div>
        {actor && (
          <section className="detail-properties" aria-label="Assignee details">
            <span className={`chip ${actor.archived ? "status-paused" : "status-active"}`}>
              {actor.archived ? "Archived" : "Active"}
            </span>
          </section>
        )}
      </div>
      <div className="detail-page-content">
        {actors.isLoading ? (
          <div className="loading-state">Loading assignee…</div>
        ) : actors.isError || !actor ? (
          <div className="error-state" role="alert">
            {actors.error?.message ?? "Assignee not found"}
          </div>
        ) : (
          <div className="detail-tabs">
            <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
            {activeTab === "projects" && (
              <div className="detail-tab-content">
                <ProjectFilterBar filter={projectFilter} onFilterChange={setProjectFilter} />
                {projects.isLoading ? (
                  <div className="loading-state">Loading projects…</div>
                ) : projects.isError ? (
                  <div className="error-state" role="alert">
                    Failed to load projects: {projects.error.message}
                  </div>
                ) : assignedProjects.length === 0 ? (
                  <div className="empty-state">No authorized projects match your filters</div>
                ) : (
                  <table className="data-table" aria-label="Authorized projects">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Status</th>
                        <th>Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedProjects.map((project) => (
                        <tr
                          key={project.id}
                          className="clickable-row"
                          tabIndex={0}
                          onClick={() => setOpenedProjectId(project.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") setOpenedProjectId(project.id);
                          }}
                        >
                          <td className="cell-name">{project.name}</td>
                          <td>
                            <StatusChip status={project.status} />
                          </td>
                          <td>
                            <PriorityChip priority={project.priority} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {activeTab === "tasks" && (
              <div className="detail-tab-content">
                <FilterBar filter={taskFilter} onFilterChange={setTaskFilter} hideAssignee />
                {tasks.isLoading || allProjects.isLoading ? (
                  <div className="loading-state">Loading tasks…</div>
                ) : tasks.isError || allProjects.isError ? (
                  <div className="error-state" role="alert">
                    Failed to load assigned tasks:{" "}
                    {tasks.error?.message ?? allProjects.error?.message}
                  </div>
                ) : assignedTasks.length === 0 ? (
                  <div className="empty-state">No assigned tasks match your filters</div>
                ) : (
                  <TaskTable
                    tasks={assignedTasks}
                    sort={sort}
                    onSort={(field) =>
                      setSort({
                        field,
                        direction:
                          sort?.field === field && sort.direction === "asc" ? "desc" : "asc",
                      })
                    }
                    onSelectTask={setOpenedTaskId}
                    onSelectAssignee={(id) => {
                      if (id !== actorId) setOpenedAssigneeId(id);
                    }}
                    projectMap={projectMap}
                    showProject={!taskFilter.projectId}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="detail-meta">
        <EntityIdCopy id={actorId} entityName="assignee" />
      </div>
    </div>
  );
}
