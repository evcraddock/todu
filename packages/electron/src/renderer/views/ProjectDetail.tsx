import type { ProjectId, TaskFilter, TaskSortField, TaskSortOptions } from "@todu/core/browser";
import { createProjectId } from "@todu/core/browser";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { CommentThread } from "../components/CommentThread.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { FilterBar } from "../components/FilterBar.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";
import { PriorityChip } from "../components/PriorityChip.js";
import { StatusChip } from "../components/StatusChip.js";
import { TabBar } from "../components/TabBar.js";
import { TaskTable } from "../components/TaskTable.js";
import {
  useDeleteProject,
  useProject,
  useProjects,
  useSearchTasks,
  useTasks,
  useUpdateProject,
} from "../hooks/useTodu.js";

// ============================================================================
// Content tabs
// ============================================================================

const TABS = [
  { id: "tasks", label: "Tasks" },
  { id: "description", label: "Description" },
  { id: "comments", label: "Comments" },
];

// ============================================================================
// Project Detail View
// ============================================================================

export function ProjectDetail({
  projectId,
  onBack,
  onSelectTask,
  onCreateTask,
}: {
  projectId: string;
  onBack: () => void;
  onSelectTask: (id: string) => void;
  onCreateTask: (projectId: string) => void;
}): ReactNode {
  const { data: project, isLoading, isError, error } = useProject(projectId);
  const { data: projects } = useProjects();
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
  const [filter, setFilter] = useState<TaskFilter>({ projectId: createProjectId(projectId) });
  const [sort, setSort] = useState<TaskSortOptions | undefined>(undefined);
  const [searchQuery, _setSearchQuery] = useState("");
  const { data: tasks } = useTasks(filter, sort);
  const { data: searchResults } = useSearchTasks(searchQuery);

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
          ← Back
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

  const taskCount = tasks?.length ?? 0;
  const displayTasks = searchQuery.length > 0 ? searchResults : tasks;

  // Keep project filter locked
  const handleFilterChange = (newFilter: TaskFilter) => {
    setFilter({ ...newFilter, projectId: createProjectId(projectId) });
  };

  return (
    <div className="view-container">
      {/* Toolbar */}
      <div className="detail-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          ← Back
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

      {/* Compressed metadata row: Status + Priority */}
      <div className="detail-meta-row">
        <div className="detail-meta-cell">
          <StatusChip status={project.status} />
          <select
            className="filter-select inline-select"
            value={project.status}
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
        </div>
        <div className="detail-meta-cell">
          <PriorityChip priority={project.priority} />
          <select
            className="filter-select inline-select"
            value={project.priority}
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
        </div>
      </div>

      {/* Tabbed content */}
      <div className="detail-tabs">
        <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "tasks" && (
          <div className="detail-tab-content">
            <div className="view-header">
              <h3 className="section-title">Tasks ({taskCount})</h3>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onCreateTask(projectId)}
              >
                + Add Task
              </button>
            </div>
            <FilterBar filter={filter} onFilterChange={handleFilterChange} hideProject />
            {!displayTasks || displayTasks.length === 0 ? (
              <div className="empty-state">
                <p>{searchQuery ? "No tasks match your search" : "No tasks in this project"}</p>
              </div>
            ) : (
              <TaskTable
                tasks={displayTasks}
                sort={sort}
                onSort={handleSort}
                onSelectTask={onSelectTask}
                projectMap={projectMap}
                showProject={false}
              />
            )}
          </div>
        )}

        {activeTab === "description" && (
          <div className="detail-tab-content">
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
          </div>
        )}

        {activeTab === "comments" && (
          <div className="detail-tab-content">
            <CommentThread entityType="project" entityId={projectId} />
          </div>
        )}
      </div>

      {/* Footer metadata */}
      <div className="detail-meta">
        <span>Created: {project.createdAt.slice(0, 10)}</span>
        <span>Updated: {project.updatedAt.slice(0, 10)}</span>
        <span>ID: {project.id}</span>
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
