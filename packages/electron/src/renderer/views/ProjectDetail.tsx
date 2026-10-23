import type { ProjectId, TaskSortField, TaskSortOptions } from "@todu/core/browser";
import { createProjectId } from "@todu/core/browser";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { CommentThread } from "../components/CommentThread.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { EntityIdCopy } from "../components/EntityIdCopy.js";
import { EntityTimestamps } from "../components/EntityTimestamps.js";
import { FilterBar } from "../components/FilterBar.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";
import { TabBar } from "../components/TabBar.js";
import { TaskTable } from "../components/TaskTable.js";
import {
  useActors,
  useDeleteProject,
  useProject,
  useProjects,
  useTasks,
  useUpdateProject,
} from "../hooks/useTodu.js";
import { createActorMap, getActorNames } from "../lib/actors.js";
import { DEFAULT_FILTER, type TaskListFilter } from "../lib/filter-persistence.js";
import { matchesTaskAssignee } from "../lib/task-assignee-filter.js";
import { AssigneeDetail } from "./AssigneeDetail.js";

// ============================================================================
// Content tabs
// ============================================================================

const TABS = [
  { id: "tasks", label: "Tasks" },
  { id: "comments", label: "Comments" },
  { id: "assignees", label: "Assignees" },
];

// ============================================================================
// Project Detail View
// ============================================================================

export function ProjectDetail({
  projectId,
  onBack,
  backLabel = "Projects",
  onSelectTask,
  onCreateTask,
}: {
  projectId: string;
  onBack: () => void;
  backLabel?: string;
  onSelectTask: (id: string) => void;
  onCreateTask: (projectId: string) => void;
}): ReactNode {
  const { data: project, isLoading, isError, error } = useProject(projectId);
  const { data: projects } = useProjects();
  const { data: actors } = useActors();
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();

  // Focus entity context for agent
  useEffect(() => {
    window.todu.agent.focusEntity("project", projectId);
    return () => {
      window.todu.agent.clearFocusedEntity();
    };
  }, [projectId]);

  // Task list for this project
  const [filter, setFilter] = useState<TaskListFilter>({
    ...DEFAULT_FILTER,
    projectId: createProjectId(projectId),
  });
  const [sort, setSort] = useState<TaskSortOptions | undefined>(undefined);
  const taskQueryFilter = { ...filter };
  delete taskQueryFilter.assignee;
  delete taskQueryFilter.activeProjects;
  const {
    data: tasks,
    isLoading: tasksLoading,
    isError: tasksError,
  } = useTasks(taskQueryFilter, sort);

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects ?? []) {
      map.set(p.id, p.name);
    }
    return map;
  }, [projects]);

  const handleSort = useCallback(
    (field: TaskSortField) => {
      if (sort?.field === field) {
        setSort({ field, direction: sort.direction === "asc" ? "desc" : "asc" });
      } else {
        setSort({ field, direction: "asc" });
      }
    },
    [sort],
  );

  // UI state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState("tasks");
  const [commentComposerOpen, setCommentComposerOpen] = useState(false);
  const [openedAssigneeId, setOpenedAssigneeId] = useState<string | null>(null);
  const [selectedAuthorizedActorId, setSelectedAuthorizedActorId] = useState("");
  const actorMap = useMemo(() => createActorMap(actors), [actors]);

  if (isLoading) {
    return (
      <div className="view-container">
        <div className="loading-state">Loading project…</div>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="view-container">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          ← {backLabel}
        </button>
        <div className="error-state">
          <p>Failed to load project</p>
          <p className="error-detail">
            {error instanceof Error ? error.message : "Project not found"}
          </p>
        </div>
      </div>
    );
  }

  const handleTitleSave = () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== project.name) {
      updateProject.mutate({ id: project.id as ProjectId, input: { name: titleValue.trim() } });
    }
  };

  const handleDescriptionSave = (markdown: string) => {
    if (markdown !== (project.description ?? "")) {
      updateProject.mutate({ id: project.id as ProjectId, input: { description: markdown } });
    }
  };

  const handleDelete = () => {
    deleteProject.mutate(project.id as ProjectId, { onSuccess: onBack });
  };

  const handleAddAuthorizedActor = () => {
    if (!availableAuthorizedActors.some((actor) => actor.id === selectedAuthorizedActorId)) return;

    updateProject.mutate({
      id: project.id as ProjectId,
      input: {
        authorizedAssigneeActorIds: [
          ...project.authorizedAssigneeActorIds,
          selectedAuthorizedActorId,
        ],
      },
    });
    setSelectedAuthorizedActorId("");
  };

  const handleRemoveAuthorizedActor = (actorId: string) => {
    updateProject.mutate({
      id: project.id as ProjectId,
      input: {
        authorizedAssigneeActorIds: project.authorizedAssigneeActorIds.filter(
          (id) => id !== actorId,
        ),
      },
    });
  };

  const authorizedActorNames = getActorNames(project.authorizedAssigneeActorIds, actorMap);
  const taskCount = tasks?.length ?? 0;
  const displayTasks = tasks?.filter((task) => matchesTaskAssignee(task, filter.assignee));
  const availableAuthorizedActors = (actors ?? []).filter(
    (actor) => !actor.archived && !project.authorizedAssigneeActorIds.includes(actor.id),
  );
  const staleUnauthorizedAssignees = (tasks ?? []).flatMap((task) => {
    const unauthorizedActorIds = task.assigneeActorIds.filter(
      (actorId) => !project.authorizedAssigneeActorIds.includes(actorId),
    );

    if (unauthorizedActorIds.length === 0) {
      return [];
    }

    return [
      {
        taskId: task.id,
        title: task.title,
        assigneeNames: getActorNames(unauthorizedActorIds, actorMap, [], {
          includeId: true,
          authorizedActorIds: project.authorizedAssigneeActorIds,
        }),
      },
    ];
  });

  // Keep project filter locked
  const handleFilterChange = (newFilter: TaskListFilter) => {
    setFilter({ ...newFilter, projectId: createProjectId(projectId) });
  };

  if (openedAssigneeId)
    return (
      <AssigneeDetail
        actorId={openedAssigneeId}
        backLabel="Project"
        onBack={() => setOpenedAssigneeId(null)}
      />
    );

  return (
    <div className="view-container entity-detail-view project-detail-view">
      <div className="detail-page-header">
        {/* Toolbar */}
        <div className="detail-toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
            ← {backLabel}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </button>
        </div>

        {/* Name */}
        <div className="detail-title-row">
          {editingTitle ? (
            <input
              className="input detail-title-input"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleSave();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="detail-title clickable"
              onClick={() => {
                setTitleValue(project.name);
                setEditingTitle(true);
              }}
            >
              {project.name}
            </button>
          )}
        </div>
        {updateProject.error && (
          <div className="error-state" role="alert">
            {updateProject.error.message}
          </div>
        )}
        <section className="detail-properties" aria-label="Project details">
          <div className="detail-property-grid">
            <label className="list-filter-field">
              Status
              <select
                className="filter-select"
                value={project.status}
                disabled={updateProject.isPending}
                onChange={(e) =>
                  updateProject.mutate({
                    id: project.id as ProjectId,
                    input: { status: e.target.value as "active" | "done" | "canceled" },
                  })
                }
              >
                <option value="active">Active</option>
                <option value="done">Done</option>
                <option value="canceled">Canceled</option>
              </select>
            </label>
            <label className="list-filter-field">
              Priority
              <select
                className="filter-select"
                value={project.priority}
                disabled={updateProject.isPending}
                onChange={(e) =>
                  updateProject.mutate({
                    id: project.id as ProjectId,
                    input: { priority: e.target.value as "high" | "medium" | "low" },
                  })
                }
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
        </section>
      </div>
      <div className="detail-page-content">
        <section
          className="detail-description-section"
          aria-labelledby="project-description-heading"
        >
          <h3 className="section-title" id="project-description-heading">
            Description
          </h3>
          {editingDescription ? (
            <MarkdownEditor
              value={project.description ?? ""}
              onChange={handleDescriptionSave}
              placeholder="Add a description…"
              minHeight={200}
              autoFocus
              onBlur={() => setEditingDescription(false)}
            />
          ) : (
            <button
              type="button"
              className="detail-description clickable"
              onClick={() => setEditingDescription(true)}
            >
              {project.description ? (
                <MarkdownEditor value={project.description} editable={false} minHeight={60} />
              ) : (
                <span className="empty-hint">Click to add description…</span>
              )}
            </button>
          )}
        </section>

        {/* Tabbed content */}
        <div className="detail-tabs">
          <TabBar
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            actions={
              activeTab === "tasks" ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onCreateTask(projectId)}
                >
                  + Add Task
                </button>
              ) : activeTab === "comments" && !commentComposerOpen ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setCommentComposerOpen(true)}
                >
                  Add Comment
                </button>
              ) : activeTab === "assignees" ? (
                <div className="assignee-add">
                  <select
                    aria-label="Add authorized actor"
                    className="filter-select"
                    disabled={updateProject.isPending || availableAuthorizedActors.length === 0}
                    value={
                      availableAuthorizedActors.some(
                        (actor) => actor.id === selectedAuthorizedActorId,
                      )
                        ? selectedAuthorizedActorId
                        : ""
                    }
                    onChange={(e) => setSelectedAuthorizedActorId(e.target.value)}
                  >
                    <option value="">
                      {availableAuthorizedActors.length === 0
                        ? "No other assignees available"
                        : "Choose an assignee…"}
                    </option>
                    {availableAuthorizedActors.map((actor) => (
                      <option key={actor.id} value={actor.id}>
                        {actor.displayName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={
                      updateProject.isPending ||
                      !availableAuthorizedActors.some(
                        (actor) => actor.id === selectedAuthorizedActorId,
                      )
                    }
                    onClick={handleAddAuthorizedActor}
                  >
                    Add assignee
                  </button>
                </div>
              ) : undefined
            }
          />

          {activeTab === "tasks" && (
            <div className="detail-tab-content">
              <FilterBar filter={filter} onFilterChange={handleFilterChange} hideProject />
              {tasksLoading ? (
                <div className="loading-state">Loading tasks…</div>
              ) : tasksError ? (
                <div className="error-state">Failed to load project tasks.</div>
              ) : !displayTasks || displayTasks.length === 0 ? (
                <div className="empty-state">
                  <p>
                    {filter.search ||
                    filter.status ||
                    filter.priority ||
                    filter.assignee ||
                    filter.today ||
                    filter.overdue
                      ? "No tasks match your filters"
                      : "No tasks in this project"}
                  </p>
                </div>
              ) : (
                <TaskTable
                  tasks={displayTasks}
                  sort={sort}
                  onSort={handleSort}
                  onSelectTask={onSelectTask}
                  onSelectAssignee={setOpenedAssigneeId}
                  projectMap={projectMap}
                  showProject={false}
                />
              )}
            </div>
          )}

          {activeTab === "assignees" && (
            <div className="detail-tab-content">
              <section className="detail-people assignees-panel" aria-label="Authorized assignees">
                <div className="assignees-controls">
                  <table className="data-table assignee-table" aria-label="Authorized people">
                    <thead>
                      <tr>
                        <th>Assignee</th>
                        <th className="assignee-actions-heading">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.authorizedAssigneeActorIds.map((actorId, index) => (
                        <tr key={actorId} title={actorId}>
                          <td>
                            <div className="assignee-person">
                              <span className="assignee-avatar" aria-hidden="true">
                                {authorizedActorNames[index].slice(0, 1).toUpperCase()}
                              </span>
                              <button
                                type="button"
                                className="assignee-name-link"
                                onClick={() => setOpenedAssigneeId(actorId)}
                              >
                                {authorizedActorNames[index]}
                              </button>
                            </div>
                          </td>
                          <td className="cell-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              aria-label={`Remove ${authorizedActorNames[index]} from authorized assignees`}
                              title={`Remove ${authorizedActorNames[index]}`}
                              disabled={updateProject.isPending}
                              onClick={() => handleRemoveAuthorizedActor(actorId)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {project.authorizedAssigneeActorIds.length === 0 && (
                    <span className="detail-property-hint">No one is authorized yet.</span>
                  )}
                </div>
                {staleUnauthorizedAssignees.length > 0 && (
                  <div className="settings-hint assignee-notice">
                    <strong>Unauthorized task assignees</strong>
                    {staleUnauthorizedAssignees.map((entry) => (
                      <div key={entry.taskId}>
                        {entry.title}: {entry.assigneeNames.join(", ")}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === "comments" && (
            <div className="detail-tab-content">
              <CommentThread
                composerOpen={commentComposerOpen}
                onComposerOpenChange={setCommentComposerOpen}
                entityType="project"
                entityId={projectId}
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer metadata */}
      <div className="detail-meta">
        <EntityTimestamps createdAt={project.createdAt} updatedAt={project.updatedAt} />
        <EntityIdCopy id={project.id} entityName="project" />
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Project"
          message={
            taskCount > 0
              ? `This project has ${taskCount} task${taskCount === 1 ? "" : "s"}. Delete "${project.name}" anyway? This cannot be undone.`
              : `Delete "${project.name}"? This cannot be undone.`
          }
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
