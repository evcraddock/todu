import { type ReactNode, useState } from "react";
import { useCreateProject } from "../hooks/useTodu.js";

export function CreateProjectDialog({
  onClose,
}: {
  onClose: () => void;
}): ReactNode {
  const createProject = useCreateProject();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

  const handleSubmit = () => {
    if (!name.trim()) return;
    createProject.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        priority: priority as "high" | "medium" | "low",
      },
      { onSuccess: onClose },
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
      <div className="dialog" onClick={(e) => e.stopPropagation()} onKeyDown={undefined}>
        <h2 className="dialog-title">New Project</h2>
        <div className="form-field">
          <label className="form-label" htmlFor="proj-name">
            Name <span className="required">*</span>
          </label>
          <input
            id="proj-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            ref={(el) => el?.focus()}
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="proj-priority">
            Priority
          </label>
          <select
            id="proj-priority"
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
          <label className="form-label" htmlFor="proj-desc">
            Description
          </label>
          <textarea
            id="proj-desc"
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
            disabled={!name.trim() || createProject.isPending}
          >
            {createProject.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
