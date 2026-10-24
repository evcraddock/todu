import { type ReactNode, useState } from "react";
import { Icon } from "../components/Icon.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";
import { useCreateProject } from "../hooks/useTodu.js";

export function CreateProjectDialog({ onClose }: { onClose: () => void }): ReactNode {
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
      <div
        className="dialog creation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={undefined}
      >
        <h2 className="dialog-title" id="new-project-title">
          New Project
        </h2>
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
            autoFocus
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
        <div className="form-field" role="group" aria-labelledby="proj-desc-label">
          <div className="form-label" id="proj-desc-label">
            Description
          </div>
          <MarkdownEditor
            value={description}
            onChange={setDescription}
            placeholder="Optional description"
            minHeight={260}
            editable={!createProject.isPending}
          />
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary btn-with-icon" onClick={onClose}>
            <Icon name="cancel" /> Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-with-icon"
            onClick={handleSubmit}
            disabled={!name.trim() || createProject.isPending}
          >
            <Icon name="add" />
            {createProject.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
