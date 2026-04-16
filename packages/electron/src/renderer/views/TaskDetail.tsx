import {
  ALLOWED_STATUS_TRANSITIONS,
  createProjectId,
  type TaskId,
  type TaskPriority,
  type TaskStatus,
} from "@todu/core/browser";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CommentThread } from "../components/CommentThread.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";
import { PriorityChip } from "../components/PriorityChip.js";
import { StatusChip } from "../components/StatusChip.js";
import { TabBar } from "../components/TabBar.js";
import {
  useActors,
  useDeleteTask,
  useMoveTask,
  useProjects,
  useTask,
  useUpdateTask,
} from "../hooks/useTodu.js";
import { createActorMap, getActorName, getActorNames, getApprovalLabel } from "../lib/actors.js";

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
// Content tabs
// ============================================================================

const TABS = [
  { id: "description", label: "Description" },
  { id: "comments", label: "Comments" },
];

// ============================================================================
// Task Detail View
// ============================================================================

export function TaskDetail({ taskId, onBack }: { taskId: string; onBack: () => void }): ReactNode {
  const { data: task, isLoading, isError, error } = useTask(taskId);
  const { data: projects } = useProjects();
  const { data: actors } = useActors();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const moveTask = useMoveTask();
  // Focus entity context for agent
  useEffect(() => {
    window.todu.agent.focusEntity("task", taskId);
    return () => {
      window.todu.agent.clearFocusedEntity();
    };
  }, [taskId]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [activeTab, setActiveTab] = useState("description");
  const [selectedAssigneeActorId, setSelectedAssigneeActorId] = useState("");
  const [replacementAssigneeActorIds, setReplacementAssigneeActorIds] = useState<
    Record<string, string>
  >({});
  const actorMap = useMemo(() => createActorMap(actors), [actors]);

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

  const handleTitleSave = () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== task.title) {
      updateTask.mutate({ id: task.id as TaskId, input: { title: titleValue.trim() } });
    }
  };

  const handleStatusChange = (status: TaskStatus) => {
    updateTask.mutate({ id: task.id as TaskId, input: { status } });
  };

  const handleDescriptionSave = (markdown: string) => {
    if (markdown !== (task.description ?? "")) {
      updateTask.mutate({ id: task.id as TaskId, input: { description: markdown } });
    }
  };

  const handleDelete = () => {
    deleteTask.mutate(task.id as TaskId, { onSuccess: onBack });
  };

  const handleMove = (projectId: string) => {
    moveTask.mutate({ id: task.id as TaskId, projectId: createProjectId(projectId) });
  };

  const currentProject = projects?.find((project) => project.id === task.projectId);
  const authorizedActorIds = currentProject?.authorizedAssigneeActorIds ?? [];
  const activeAuthorizedActors = (actors ?? []).filter(
    (actor) => !actor.archived && authorizedActorIds.includes(actor.id),
  );
  const addableAssigneeActors = activeAuthorizedActors.filter(
    (actor) => !task.assigneeActorIds.includes(actor.id),
  );
  const assigneeEntries = task.assigneeActorIds.map((actorId) => ({
    actorId,
    label: getActorName(actorId, actorMap, undefined, {
      includeId: true,
      authorizedActorIds,
    }),
    replacementOptions: addableAssigneeActors,
  }));
  const legacyAssigneeNames =
    task.assigneeActorIds.length === 0
      ? getActorNames(task.assigneeActorIds, actorMap, task.assignees, {
          authorizedActorIds,
        })
      : [];
  const descriptionApprovalLabel = getApprovalLabel(task.descriptionApproval);
  const validatedSelectedAssigneeActorId = addableAssigneeActors.some(
    (actor) => actor.id === selectedAssigneeActorId,
  )
    ? selectedAssigneeActorId
    : "";

  const updateAssignees = (assigneeActorIds: string[]) => {
    updateTask.mutate({
      id: task.id as TaskId,
      input: { assigneeActorIds },
    });
  };

  const handleAddAssignee = () => {
    if (!validatedSelectedAssigneeActorId) return;

    updateAssignees([...task.assigneeActorIds, validatedSelectedAssigneeActorId]);
    setSelectedAssigneeActorId("");
  };

  const handleRemoveAssignee = (actorId: string) => {
    updateAssignees(task.assigneeActorIds.filter((currentActorId) => currentActorId !== actorId));
    setReplacementAssigneeActorIds((prev) => {
      const next = { ...prev };
      delete next[actorId];
      return next;
    });
  };

  const handleReplaceAssignee = (actorId: string) => {
    const replacementActorId = replacementAssigneeActorIds[actorId];
    const validatedReplacementActorId = addableAssigneeActors.some(
      (actor) => actor.id === replacementActorId,
    )
      ? replacementActorId
      : "";
    if (!validatedReplacementActorId) return;

    updateAssignees(
      task.assigneeActorIds.map((currentActorId) =>
        currentActorId === actorId ? validatedReplacementActorId : currentActorId,
      ),
    );
    setReplacementAssigneeActorIds((prev) => ({ ...prev, [actorId]: "" }));
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

      {/* Title */}
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
              setTitleValue(task.title);
              setEditingTitle(true);
            }}
          >
            {task.title}
          </button>
        )}
      </div>

      {/* Compressed metadata — Row 1: Status + Priority */}
      <div className="detail-meta-row">
        <div className="detail-meta-cell">
          <StatusChip status={task.status} />
          <StatusShortcuts currentStatus={task.status} onStatusChange={handleStatusChange} />
        </div>
        <div className="detail-meta-cell">
          <PriorityChip priority={task.priority} />
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
      </div>

      {/* Compressed metadata — Row 2: Project, Due Date, Labels */}
      <div className="detail-meta-row">
        <div className="detail-meta-cell">
          <span className="detail-meta-label">Project</span>
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
        <div className="detail-meta-cell">
          <span className="detail-meta-label">Due</span>
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
        <div className="detail-meta-cell">
          <span className="detail-meta-label">Labels</span>
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
      </div>

      <div className="detail-meta-row">
        <div className="detail-meta-cell detail-meta-cell-wide">
          <span className="detail-meta-label">Assignees</span>

          {assigneeEntries.length > 0 ? (
            assigneeEntries.map((entry) => (
              <div key={entry.actorId} className="settings-key-row">
                <div className="settings-key-header">
                  <span className="settings-key-label">{entry.label}</span>
                </div>
                <div className="settings-key-input-row">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRemoveAssignee(entry.actorId)}
                  >
                    Remove
                  </button>
                  <select
                    aria-label={`Replace assignee ${entry.actorId}`}
                    className="input inline-select"
                    value={
                      entry.replacementOptions.some(
                        (actor) => actor.id === replacementAssigneeActorIds[entry.actorId],
                      )
                        ? (replacementAssigneeActorIds[entry.actorId] ?? "")
                        : ""
                    }
                    onChange={(e) =>
                      setReplacementAssigneeActorIds((prev) => ({
                        ...prev,
                        [entry.actorId]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Replace with…</option>
                    {entry.replacementOptions.map((actor) => (
                      <option key={actor.id} value={actor.id}>
                        {actor.displayName} ({actor.id})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={
                      !entry.replacementOptions.some(
                        (actor) => actor.id === replacementAssigneeActorIds[entry.actorId],
                      )
                    }
                    onClick={() => handleReplaceAssignee(entry.actorId)}
                  >
                    Replace
                  </button>
                </div>
              </div>
            ))
          ) : legacyAssigneeNames.length > 0 ? (
            <div className="label-chips">
              {legacyAssigneeNames.map((assignee) => (
                <span key={assignee} className="chip chip-label">
                  {assignee}
                </span>
              ))}
            </div>
          ) : (
            <span className="empty-hint">None</span>
          )}

          <div className="settings-key-input-row">
            <select
              aria-label="Add assignee actor"
              className="input inline-select"
              value={validatedSelectedAssigneeActorId}
              onChange={(e) => setSelectedAssigneeActorId(e.target.value)}
            >
              <option value="">Add assignee…</option>
              {addableAssigneeActors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.displayName} ({actor.id})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!validatedSelectedAssigneeActorId}
              onClick={handleAddAssignee}
            >
              Add
            </button>
          </div>

          {!currentProject ? (
            <span className="empty-hint">Task project is unavailable.</span>
          ) : activeAuthorizedActors.length === 0 ? (
            <span className="empty-hint">
              No authorized active actors available for this project.
            </span>
          ) : addableAssigneeActors.length === 0 ? (
            <span className="empty-hint">All authorized active actors are already assigned.</span>
          ) : null}
        </div>
      </div>

      {/* Tabbed content */}
      <div className="detail-tabs">
        <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "description" && (
          <div className="detail-tab-content">
            {descriptionApprovalLabel && (
              <div className="detail-approval-row">
                <span className="chip chip-label">{descriptionApprovalLabel}</span>
              </div>
            )}
            {editingDescription ? (
              <MarkdownEditor
                value={task.description ?? ""}
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
                {task.description ? (
                  <MarkdownEditor value={task.description} editable={false} minHeight={60} />
                ) : (
                  <span className="empty-hint">Click to add description…</span>
                )}
              </button>
            )}
          </div>
        )}

        {activeTab === "comments" && (
          <div className="detail-tab-content">
            <CommentThread entityType="task" entityId={taskId} />
          </div>
        )}
      </div>

      {/* Footer metadata */}
      <div className="detail-meta">
        <span>Created: {task.createdAt.slice(0, 10)}</span>
        <span>Updated: {task.updatedAt.slice(0, 10)}</span>
        <span>ID: {task.id}</span>
      </div>

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
