import { createProjectId, type TaskPriority } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { useCreateTask, useProjects } from "../hooks/useTodu.js";

export function CreateTaskDialog({
  onClose,
  defaultProjectId,
}: {
  onClose: () => void;
  defaultProjectId?: string;
}): ReactNode {
  const { data: projects } = useProjects();
  const createTask = useCreateTask();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");

  // Default to specified project or first project
  const effectiveProjectId = projectId || defaultProjectId || projects?.[0]?.id || "";

  const handleSubmit = () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!effectiveProjectId) {
      setError("Select a project");
      return;
    }
    setError("");
    createTask.mutate(
      {
        title: title.trim(),
        projectId: createProjectId(effectiveProjectId),
        priority: priority as TaskPriority,
        description: description.trim() || undefined,
        dueDate: dueDate || undefined,
      },
      {
        onSuccess: onClose,
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to create task"),
      },
    );
  };

  return (
    <div
      className="dialog-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="dialog dialog-wide"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={undefined}
      >
        <h3 className="dialog-title">New Task</h3>

        {error && <div className="dialog-error">{error}</div>}

        <div className="form-field">
          <label className="form-label" htmlFor="task-title">
            Title *
          </label>
          <input
            id="task-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="Task title"
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="task-project">
            Project *
          </label>
          <select
            id="task-project"
            className="input"
            value={effectiveProjectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="form-label" htmlFor="task-priority">
              Priority
            </label>
            <select
              id="task-priority"
              className="input"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="task-due">
              Due Date
            </label>
            <input
              id="task-due"
              type="date"
              className="input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="task-desc">
            Description
          </label>
          <textarea
            id="task-desc"
            className="input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={createTask.isPending}
          >
            {createTask.isPending ? "Creating…" : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
