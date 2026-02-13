import type { LabelId } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { useDeleteLabel, useLabels, useTasks } from "../hooks/useTodu.js";

export function LabelList({
  onCreateLabel,
  onEditLabel,
}: {
  onCreateLabel: () => void;
  onEditLabel: (id: string) => void;
}): ReactNode {
  const { data: labels, isLoading, isError, error } = useLabels();
  const { data: allTasks } = useTasks();
  const deleteLabel = useDeleteLabel();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Count tasks per label
  const labelUsage = new Map<string, number>();
  for (const task of allTasks ?? []) {
    for (const labelName of task.labels) {
      labelUsage.set(labelName, (labelUsage.get(labelName) ?? 0) + 1);
    }
  }

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteLabel.mutate(deleteTarget.id as LabelId, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  if (isLoading) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Labels</h2>
        </div>
        <div className="loading-state">Loading labels…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2 className="view-title">Labels</h2>
        </div>
        <div className="error-state">
          <p>Failed to load labels</p>
          <p className="error-detail">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <h2 className="view-title">Labels</h2>
        <button type="button" className="btn btn-primary" onClick={onCreateLabel}>
          + New Label
        </button>
      </div>

      {!labels || labels.length === 0 ? (
        <div className="empty-state">
          <p>No labels yet</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Color</th>
              <th>Name</th>
              <th>Tasks</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {labels.map((label) => {
              const count = labelUsage.get(label.name) ?? 0;
              return (
                <tr key={label.id}>
                  <td>
                    {label.color ? (
                      <span className="color-dot" style={{ backgroundColor: label.color }} />
                    ) : (
                      <span className="color-dot color-dot-empty" />
                    )}
                  </td>
                  <td className="cell-name">{label.name}</td>
                  <td className="cell-count">{count}</td>
                  <td className="cell-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onEditLabel(label.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteTarget({ id: label.id, name: label.name })}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Label"
          message={
            (labelUsage.get(deleteTarget.name) ?? 0) > 0
              ? `This label is used on ${labelUsage.get(deleteTarget.name)} task${(labelUsage.get(deleteTarget.name) ?? 0) === 1 ? "" : "s"}. Removing "${deleteTarget.name}" will remove it from those tasks.`
              : `Delete "${deleteTarget.name}"? This cannot be undone.`
          }
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
