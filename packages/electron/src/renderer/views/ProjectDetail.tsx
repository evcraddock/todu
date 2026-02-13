import type { ProjectId, TaskFilter, TaskSortField, TaskSortOptions } from "@todu/core/browser";
import { createProjectId } from "@todu/core/browser";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { CommentThread } from "../components/CommentThread.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { FilterBar } from "../components/FilterBar.js";
import { PriorityChip } from "../components/PriorityChip.js";
import { StatusChip } from "../components/StatusChip.js";
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

  // Task list for this project
  const [filter, setFilter] = useState<TaskFilter>({ projectId: createProjectId(projectId) });
  const [sort, setSort] = useState<TaskSortOptions | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
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

  // Inline edit state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  const handleInlineEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const handleInlineSave = (field: string) => {
    setEditingField(null);
    if (editValue !== (project as Record<string, unknown>)[field]) {
      updateProject.mutate({ id: project.id as ProjectId, input: { [field]: editValue } });
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
        {editingField === "name" ? (
          <input
            className="input detail-title-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleInlineSave("name")}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInlineSave("name");
              if (e.key === "Escape") setEditingField(null);
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="detail-title clickable"
            onClick={() => handleInlineEdit("name", project.name)}
          >
            {project.name}
          </button>
        )}
      </div>

      {/* Status */}
      <div className="detail-field">
        <span className="detail-label">Status</span>
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

      {/* Priority */}
      <div className="detail-field">
        <span className="detail-label">Priority</span>
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

      {/* Description */}
      <div className="detail-section">
        <h3 className="section-title">Description</h3>
        {editingField === "description" ? (
          <textarea
            className="input detail-description-input"
            rows={3}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleInlineSave("description")}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="detail-description clickable"
            onClick={() => handleInlineEdit("description", project.description ?? "")}
          >
            {project.description || <span className="empty-hint">Click to add description…</span>}
          </button>
        )}
      </div>

      {/* Metadata */}
      <div className="detail-meta">
        <span>Created: {project.createdAt.slice(0, 10)}</span>
        <span>Updated: {project.updatedAt.slice(0, 10)}</span>
        <span>ID: {project.id}</span>
      </div>

      {/* Tasks */}
      <div className="detail-section">
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
        <FilterBar
          filter={filter}
          onFilterChange={handleFilterChange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          hideProject
        />
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

      {/* Comments */}
      <CommentThread entityType="project" entityId={projectId} />

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
