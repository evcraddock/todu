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
import { EntityIdCopy } from "../components/EntityIdCopy.js";
import { EntityTimestamps } from "../components/EntityTimestamps.js";
import { LabelPicker } from "../components/LabelPicker.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";
import { TabBar } from "../components/TabBar.js";
import {
  useActors,
  useApproveTaskDescription,
  useDeleteTask,
  useMoveTask,
  useProjects,
  useTask,
  useUpdateTask,
} from "../hooks/useTodu.js";
import { createActorMap, getActorName, getActorNames, getApprovalLabel } from "../lib/actors.js";
import { AssigneeDetail } from "./AssigneeDetail.js";

const STATUS_LABELS: Record<TaskStatus, string> = {
  active: "Active",
  inprogress: "In progress",
  waiting: "Waiting",
  done: "Done",
  canceled: "Canceled",
};

// ============================================================================
// Content tabs
// ============================================================================

const TABS = [
  { id: "description", label: "Description" },
  { id: "comments", label: "Comments" },
  { id: "assignees", label: "Assignees" },
];

// ============================================================================
// Task Detail View
// ============================================================================

export function TaskDetail({
  taskId,
  onBack,
  backLabel = "Tasks",
}: {
  taskId: string;
  onBack: () => void;
  backLabel?: string;
}): ReactNode {
  const { data: task, isLoading, isError, error } = useTask(taskId);
  const { data: projects } = useProjects();
  const { data: actors } = useActors();
  const updateTask = useUpdateTask();
  const approveTaskDescription = useApproveTaskDescription();
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
  const [commentComposerOpen, setCommentComposerOpen] = useState(false);
  const [openedAssigneeId, setOpenedAssigneeId] = useState<string | null>(null);
  const [selectedAssigneeActorId, setSelectedAssigneeActorId] = useState("");
  const [replacementAssigneeActorIds, setReplacementAssigneeActorIds] = useState<
    Record<string, string>
  >({});
  const [replacingActorId, setReplacingActorId] = useState<string | null>(null);
  const [approvalMessage, setApprovalMessage] = useState("");

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
          ← {backLabel}
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
    if (replacingActorId === actorId) setReplacingActorId(null);
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
    setReplacingActorId(null);
  };

  if (openedAssigneeId)
    return (
      <AssigneeDetail
        actorId={openedAssigneeId}
        backLabel="Task"
        onBack={() => setOpenedAssigneeId(null)}
      />
    );

  return (
    <div className="view-container entity-detail-view">
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
        {updateTask.error && (
          <div className="error-state" role="alert">
            {updateTask.error.message}
          </div>
        )}
        {moveTask.error && (
          <div className="error-state" role="alert">
            {moveTask.error.message}
          </div>
        )}
        <section className="detail-properties" aria-label="Task details">
          <div className="detail-property-grid">
            <label className="list-filter-field">
              Status
              <select
                className="filter-select"
                value={task.status}
                disabled={updateTask.isPending}
                onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
              >
                {[task.status, ...ALLOWED_STATUS_TRANSITIONS[task.status]].map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="list-filter-field">
              Priority
              <select
                className="filter-select"
                value={task.priority}
                disabled={updateTask.isPending}
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
            </label>
            <label className="list-filter-field">
              Project
              <select
                className="filter-select"
                value={task.projectId}
                disabled={moveTask.isPending}
                onChange={(e) => handleMove(e.target.value)}
              >
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="detail-date-grid">
            <label className="list-filter-field">
              Scheduled date
              <input
                type="date"
                className="input"
                value={task.scheduledDate?.slice(0, 10) ?? ""}
                aria-label="Scheduled date"
                aria-describedby="task-scheduled-hint"
                disabled={updateTask.isPending}
                onChange={(e) => {
                  if (e.target.value)
                    updateTask.mutate({
                      id: task.id as TaskId,
                      input: { scheduledDate: e.target.value },
                    });
                }}
              />
              <span className="detail-property-hint" id="task-scheduled-hint">
                When you plan to work on this task.
              </span>
            </label>
            <label className="list-filter-field">
              Due date
              <input
                type="date"
                className="input"
                value={task.dueDate?.slice(0, 10) ?? ""}
                aria-label="Due date"
                aria-describedby="task-due-hint"
                disabled={updateTask.isPending}
                onChange={(e) => {
                  if (e.target.value)
                    updateTask.mutate({
                      id: task.id as TaskId,
                      input: { dueDate: e.target.value },
                    });
                }}
              />
              <span className="detail-property-hint" id="task-due-hint">
                The deadline for finishing this task.
              </span>
            </label>
          </div>
          <LabelPicker
            labels={task.labels}
            isPending={updateTask.isPending}
            onSave={(labels, onSuccess) =>
              updateTask.mutate({ id: task.id as TaskId, input: { labels } }, { onSuccess })
            }
          />
        </section>
      </div>
      <div className="detail-page-content">
        {/* Tabbed content */}
        <div className="detail-tabs">
          <TabBar
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            actions={
              activeTab === "comments" && !commentComposerOpen ? (
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
                    aria-label="Add assignee actor"
                    className="filter-select"
                    disabled={updateTask.isPending || addableAssigneeActors.length === 0}
                    value={validatedSelectedAssigneeActorId}
                    onChange={(e) => setSelectedAssigneeActorId(e.target.value)}
                  >
                    <option value="">
                      {addableAssigneeActors.length === 0
                        ? "No other assignees available"
                        : "Choose an assignee…"}
                    </option>
                    {addableAssigneeActors.map((actor) => (
                      <option key={actor.id} value={actor.id}>
                        {actor.displayName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!validatedSelectedAssigneeActorId || updateTask.isPending}
                    onClick={handleAddAssignee}
                  >
                    Add assignee
                  </button>
                </div>
              ) : undefined
            }
          />

          {activeTab === "description" && (
            <div className="detail-tab-content">
              {approvalMessage && <div className="settings-hint">{approvalMessage}</div>}
              {descriptionApprovalLabel && (
                <div className="detail-approval-row">
                  <span className="chip chip-label">{descriptionApprovalLabel}</span>
                  {task.descriptionApproval?.state === "pendingApproval" && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        approveTaskDescription.mutate(task.id as TaskId, {
                          onSuccess: () => setApprovalMessage("Task description approved."),
                          onError: (err) =>
                            setApprovalMessage(
                              err instanceof Error
                                ? err.message
                                : "Failed to approve task description",
                            ),
                        })
                      }
                      disabled={approveTaskDescription.isPending}
                    >
                      {approveTaskDescription.isPending ? "Approving…" : "Approve"}
                    </button>
                  )}
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

          {activeTab === "assignees" && (
            <div className="detail-tab-content">
              <section
                className="detail-people task-assignees assignees-panel"
                aria-label="Task assignees"
              >
                <div className="assignees-controls">
                  <table className="data-table assignee-table" aria-label="Assigned people">
                    <thead>
                      <tr>
                        <th>Assignee</th>
                        <th className="assignee-actions-heading">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assigneeEntries.map((entry) => (
                        <tr key={entry.actorId} title={entry.actorId}>
                          <td>
                            <div className="assignee-person">
                              <span className="assignee-avatar" aria-hidden="true">
                                {entry.label.slice(0, 1).toUpperCase()}
                              </span>
                              <button
                                type="button"
                                className="assignee-name-link"
                                onClick={() => setOpenedAssigneeId(entry.actorId)}
                              >
                                {entry.label}
                              </button>
                            </div>
                          </td>
                          <td className="cell-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              aria-label={`Remove ${entry.label} from task assignees`}
                              disabled={updateTask.isPending}
                              onClick={() => handleRemoveAssignee(entry.actorId)}
                            >
                              Remove
                            </button>
                            {entry.replacementOptions.length > 0 && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                aria-label={`Replace ${entry.label}`}
                                disabled={updateTask.isPending}
                                onClick={() => setReplacingActorId(entry.actorId)}
                              >
                                Replace
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {assigneeEntries.length === 0 &&
                        legacyAssigneeNames.map((name) => (
                          <tr key={name}>
                            <td>{name}</td>
                            <td className="cell-actions">—</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {assigneeEntries.length === 0 && legacyAssigneeNames.length === 0 && (
                    <span className="detail-property-hint">No one is assigned yet.</span>
                  )}
                </div>
                {assigneeEntries
                  .filter((entry) => entry.actorId === replacingActorId)
                  .map((entry) => (
                    <div className="assignee-replacement" key={entry.actorId}>
                      <label className="list-filter-field">
                        Replace {entry.label}
                        <select
                          aria-label={`Replace assignee ${entry.actorId}`}
                          className="filter-select"
                          disabled={updateTask.isPending}
                          value={
                            entry.replacementOptions.some(
                              (actor) => actor.id === replacementAssigneeActorIds[entry.actorId],
                            )
                              ? replacementAssigneeActorIds[entry.actorId]
                              : ""
                          }
                          onChange={(e) =>
                            setReplacementAssigneeActorIds((prev) => ({
                              ...prev,
                              [entry.actorId]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Choose an assignee…</option>
                          {entry.replacementOptions.map((actor) => (
                            <option key={actor.id} value={actor.id}>
                              {actor.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={
                          updateTask.isPending ||
                          !entry.replacementOptions.some(
                            (actor) => actor.id === replacementAssigneeActorIds[entry.actorId],
                          )
                        }
                        onClick={() => handleReplaceAssignee(entry.actorId)}
                      >
                        Apply replacement
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setReplacingActorId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                {!currentProject ? (
                  <p className="detail-property-hint assignee-notice">
                    Task project is unavailable.
                  </p>
                ) : activeAuthorizedActors.length === 0 ? (
                  <p className="detail-property-hint assignee-notice">
                    No authorized active actors available for this project.
                  </p>
                ) : null}
              </section>
            </div>
          )}

          {activeTab === "comments" && (
            <div className="detail-tab-content">
              <CommentThread
                composerOpen={commentComposerOpen}
                onComposerOpenChange={setCommentComposerOpen}
                entityType="task"
                entityId={taskId}
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer metadata */}
      <div className="detail-meta">
        <EntityTimestamps createdAt={task.createdAt} updatedAt={task.updatedAt} />
        <EntityIdCopy id={task.id} entityName="task" />
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
