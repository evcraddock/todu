import {
  ALLOWED_STATUS_TRANSITIONS,
  type TaskId,
  type TaskPriority,
  type TaskStatus,
  createProjectId,
} from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { CommentThread } from "../components/CommentThread.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { PriorityChip } from "../components/PriorityChip.js";
import { StatusChip } from "../components/StatusChip.js";
import {
  useDeleteTask,
  useMoveTask,
  useProjects,
  useTask,
  useUpdateTask,
} from "../hooks/useTodu.js";

// ============================================================================
// Status Shortcuts
// ============================================================================

function StatusShortcuts({
  currentStatus,
  onStatusChange,
}: {
  currentStatus: TaskStatus;
  onStatusChange: (status: TaskStatus) => void;
}): ReactNode {
  const shortcuts: { label: string; target: TaskStatus }[] = [
    { label: "Start", target: "inprogress" },
    { label: "Done", target: "done" },
    { label: "Cancel", target: "canceled" },
    { label: "Reopen", target: "active" },
  ];

  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [];

  return (
    <div className="status-shortcuts">
      {shortcuts
        .filter((s) => allowed.includes(s.target))
        .map((s) => (
          <button
            key={s.target}
            type="button"
            className={`btn btn-sm status-btn-${s.target}`}
            onClick={() => onStatusChange(s.target)}
          >
            {s.label}
          </button>
        ))}
    </div>
  );
}

// ============================================================================
// Task Detail View
// ============================================================================

export function TaskDetail({
  taskId,
  onBack,
}: {
  taskId: string;
  onBack: () => void;
}): ReactNode {
  const { data: task, isLoading, isError, error } = useTask(taskId);
  const { data: projects } = useProjects();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const moveTask = useMoveTask();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  if (isLoading) {
    return (
      <div className="view-container">
        <div className="loading-state">Loading task…</div>
      </div>
    );
  }

  if (isError || !task) {
    return (
      <div className="view-container">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          ← Back
        </button>
        <div className="error-state">
          <p>Failed to load task</p>
          <p className="error-detail">
            {error instanceof Error ? error.message : "Task not found"}
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
    if (editValue !== (task as Record<string, unknown>)[field]) {
      updateTask.mutate({ id: task.id as TaskId, input: { [field]: editValue } });
    }
  };

  const handleStatusChange = (status: TaskStatus) => {
    updateTask.mutate({ id: task.id as TaskId, input: { status } });
  };

  const handleDelete = () => {
    deleteTask.mutate(task.id as TaskId, { onSuccess: onBack });
  };

  const handleMove = (projectId: string) => {
    moveTask.mutate({ id: task.id as TaskId, projectId: createProjectId(projectId) });
  };

  const projectName = projects?.find((p) => p.id === task.projectId)?.name ?? "—";

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

      {/* Title */}
      <div className="detail-title-row">
        {editingField === "title" ? (
          <input
            className="input detail-title-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleInlineSave("title")}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInlineSave("title");
              if (e.key === "Escape") setEditingField(null);
            }}
            ref={(el) => el?.focus()}
          />
        ) : (
          <button
            type="button"
            className="detail-title clickable"
            onClick={() => handleInlineEdit("title", task.title)}
          >
            {task.title}
          </button>
        )}
      </div>

      {/* Status + shortcuts */}
      <div className="detail-field">
        <span className="detail-label">Status</span>
        <StatusChip status={task.status} />
        <StatusShortcuts currentStatus={task.status} onStatusChange={handleStatusChange} />
      </div>

      {/* Priority */}
      <div className="detail-field">
        <span className="detail-label">Priority</span>
        <select
          className="filter-select inline-select"
          value={task.priority}
          onChange={(e) =>
            updateTask.mutate({
              id: task.id as TaskId,
              input: { priority: e.target.value as TaskPriority },
            })
          }
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Project */}
      <div className="detail-field">
        <span className="detail-label">Project</span>
        <select
          className="filter-select inline-select"
          value={task.projectId}
          onChange={(e) => handleMove(e.target.value)}
        >
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Due Date */}
      <div className="detail-field">
        <span className="detail-label">Due Date</span>
        <input
          type="date"
          className="input inline-input"
          value={task.dueDate?.slice(0, 10) ?? ""}
          onChange={(e) =>
            updateTask.mutate({
              id: task.id as TaskId,
              input: { dueDate: e.target.value || undefined },
            })
          }
        />
      </div>

      {/* Labels */}
      <div className="detail-field">
        <span className="detail-label">Labels</span>
        <div className="label-chips">
          {task.labels.length > 0 ? (
            task.labels.map((l) => (
              <span key={l} className="chip chip-label">
                {l}
              </span>
            ))
          ) : (
            <span className="empty-hint">None</span>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="detail-section">
        <h3 className="section-title">Description</h3>
        {editingField === "description" ? (
          <textarea
            className="input detail-description-input"
            rows={5}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleInlineSave("description")}
            ref={(el) => el?.focus()}
          />
        ) : (
          <button
            type="button"
            className="detail-description clickable"
            onClick={() => handleInlineEdit("description", task.description ?? "")}
          >
            {task.description || <span className="empty-hint">Click to add description…</span>}
          </button>
        )}
      </div>

      {/* Metadata */}
      <div className="detail-meta">
        <span>Created: {task.createdAt.slice(0, 10)}</span>
        <span>Updated: {task.updatedAt.slice(0, 10)}</span>
        <span>ID: {task.id}</span>
      </div>

      {/* Comments */}
      <CommentThread entityType="task" entityId={taskId} />

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Task"
          message={`Delete "${task.title}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
