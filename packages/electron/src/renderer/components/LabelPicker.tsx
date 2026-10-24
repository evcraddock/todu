import { type ReactNode, useState } from "react";
import { useLabels } from "../hooks/useTodu.js";
import { Icon } from "./Icon.js";

export function LabelPicker({
  labels,
  isPending,
  onSave,
}: {
  labels: string[];
  isPending?: boolean;
  onSave: (labels: string[], onSuccess: () => void) => void;
}): ReactNode {
  const { data: availableLabels } = useLabels();
  const [editingLabels, setEditingLabels] = useState(false);
  const [draftLabels, setDraftLabels] = useState<string[]>([]);
  const [labelName, setLabelName] = useState("");
  const openLabelEditor = () => {
    setDraftLabels([...labels]);
    setLabelName("");
    setEditingLabels(true);
  };

  const addDraftLabel = () => {
    const name = labelName.trim();
    if (name && !draftLabels.includes(name)) setDraftLabels([...draftLabels, name]);
    setLabelName("");
  };

  const saveLabels = () => {
    const name = labelName.trim();
    const labels = name && !draftLabels.includes(name) ? [...draftLabels, name] : draftLabels;
    onSave(labels, () => setEditingLabels(false));
  };

  return (
    <>
      {labels.length > 0 && !editingLabels && (
        <div className="task-label-summary">
          <span className="detail-meta-label">Labels</span>
          <div className="label-chips">
            {labels.map((label) => (
              <span key={label} className="chip chip-label">
                {label}
              </span>
            ))}
          </div>
          <button type="button" className="btn btn-sm task-label-edit" onClick={openLabelEditor}>
            <Icon name="edit" /> Edit labels
          </button>
        </div>
      )}
      {editingLabels && (
        <section className="task-label-editor" aria-label="Edit task labels">
          <h3 className="section-title">Labels</h3>
          {draftLabels.length > 0 && (
            <div className="label-chips">
              {draftLabels.map((label) => (
                <span key={label} className="chip chip-label">
                  {label}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-with-icon"
                    aria-label={`Remove label ${label}`}
                    disabled={isPending}
                    onClick={() => setDraftLabels(draftLabels.filter((name) => name !== label))}
                  >
                    <Icon name="delete" />
                    Remove
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="task-label-input">
            <label className="list-filter-field">
              Label name
              <input
                className="input"
                list="task-label-suggestions"
                value={labelName}
                placeholder="Choose or enter a label…"
                disabled={isPending}
                onChange={(e) => setLabelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDraftLabel();
                  }
                }}
              />
              <datalist id="task-label-suggestions">
                {availableLabels
                  ?.filter((label) => !draftLabels.includes(label.name))
                  .map((label) => (
                    <option key={label.id} value={label.name} />
                  ))}
              </datalist>
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-with-icon"
              disabled={!labelName.trim() || isPending}
              onClick={addDraftLabel}
            >
              <Icon name="add" />
              Add label
            </button>
          </div>
          <div className="task-label-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm btn-with-icon"
              disabled={isPending}
              onClick={saveLabels}
            >
              <Icon name="save" /> Save labels
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-with-icon"
              disabled={isPending}
              onClick={() => setEditingLabels(false)}
            >
              <Icon name="cancel" /> Cancel
            </button>
          </div>
        </section>
      )}
      <div className="task-property-footer">
        {labels.length === 0 && !editingLabels && (
          <button type="button" className="btn btn-sm task-label-edit" onClick={openLabelEditor}>
            <Icon name="add" /> Add labels
          </button>
        )}
      </div>
    </>
  );
}
