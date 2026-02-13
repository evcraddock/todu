import type { LabelId } from "@todu/core/browser";
import { type ReactNode, useEffect, useState } from "react";
import { ColorPicker } from "../components/ColorPicker.js";
import { useCreateLabel, useLabels, useUpdateLabel } from "../hooks/useTodu.js";

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Shared dialog for creating and editing labels.
 * Pass `editLabelId` to edit an existing label, or omit for create mode.
 */
export function LabelDialog({
  onClose,
  editLabelId,
}: {
  onClose: () => void;
  editLabelId?: string;
}): ReactNode {
  const { data: labels } = useLabels();
  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();

  const existingLabel = editLabelId ? labels?.find((l) => l.id === editLabelId) : undefined;
  const isEdit = !!editLabelId;

  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState("");

  // Populate form when editing
  useEffect(() => {
    if (existingLabel) {
      setName(existingLabel.name);
      setColor(existingLabel.color ?? "");
    }
  }, [existingLabel]);

  const handleSubmit = () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (color && !HEX_COLOR_REGEX.test(color)) {
      setError("Invalid color format. Use #RRGGBB.");
      return;
    }
    setError("");

    if (isEdit && editLabelId) {
      updateLabel.mutate(
        {
          id: editLabelId as LabelId,
          input: {
            name: name.trim(),
            color: color || undefined,
          },
        },
        {
          onSuccess: onClose,
          onError: (err) => setError(err instanceof Error ? err.message : "Failed to update label"),
        },
      );
    } else {
      createLabel.mutate(
        {
          name: name.trim(),
          color: color || undefined,
        },
        {
          onSuccess: onClose,
          onError: (err) => setError(err instanceof Error ? err.message : "Failed to create label"),
        },
      );
    }
  };

  const isPending = createLabel.isPending || updateLabel.isPending;

  return (
    <div
      className="dialog-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="dialog" onClick={(e) => e.stopPropagation()} onKeyDown={undefined}>
        <h2 className="dialog-title">{isEdit ? "Edit Label" : "New Label"}</h2>

        {error && <div className="dialog-error">{error}</div>}

        <div className="form-field">
          <label className="form-label" htmlFor="label-name">
            Name <span className="required">*</span>
          </label>
          <input
            id="label-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="Label name"
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="label-color">
            Color
          </label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!name.trim() || isPending}
          >
            {isPending ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
