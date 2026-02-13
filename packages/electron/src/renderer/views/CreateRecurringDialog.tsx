import { createProjectId } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { SchedulePresetPicker } from "../components/SchedulePresetPicker.js";
import { useCreateRecurring, useProjects } from "../hooks/useTodu.js";

export function CreateRecurringDialog({ onClose }: { onClose: () => void }): ReactNode {
  const { data: projects } = useProjects();
  const createRecurring = useCreateRecurring();

  const [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState("FREQ=DAILY");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  const effectiveProjectId = projectId || projects?.[0]?.id || "";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleSubmit = () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!schedule.trim()) {
      setError("Schedule is required");
      return;
    }
    if (!effectiveProjectId) {
      setError("Select a project");
      return;
    }
    setError("");
    createRecurring.mutate(
      {
        title: title.trim(),
        schedule,
        projectId: createProjectId(effectiveProjectId),
        timezone,
        startDate,
        priority: priority as "high" | "medium" | "low",
        description: description.trim() || undefined,
        endDate: endDate || undefined,
      },
      {
        onSuccess: onClose,
        onError: (err) =>
          setError(err instanceof Error ? err.message : "Failed to create template"),
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
        <h3 className="dialog-title">New Recurring Template</h3>

        {error && <div className="dialog-error">{error}</div>}

        <div className="form-field">
          <label className="form-label" htmlFor="rec-title">
            Title *
          </label>
          <input
            id="rec-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Recurring task title"
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="rec-schedule">
            Schedule *
          </label>
          <SchedulePresetPicker value={schedule} onChange={setSchedule} />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="rec-project">
            Project *
          </label>
          <select
            id="rec-project"
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
            <label className="form-label" htmlFor="rec-priority">
              Priority
            </label>
            <select
              id="rec-priority"
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
            <label className="form-label" htmlFor="rec-start">
              Start Date *
            </label>
            <input
              id="rec-start"
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="rec-end">
              End Date
            </label>
            <input
              id="rec-end"
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="rec-desc">
            Description
          </label>
          <textarea
            id="rec-desc"
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
            disabled={createRecurring.isPending}
          >
            {createRecurring.isPending ? "Creating…" : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
