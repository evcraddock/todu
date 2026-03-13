import type { ProjectId } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { SchedulePresetPicker } from "../components/SchedulePresetPicker.js";
import { useCreateHabit, useProjects } from "../hooks/useTodu.js";

export function CreateHabitDialog({ onClose }: { onClose: () => void }): ReactNode {
  const { data: projects } = useProjects();
  const createHabit = useCreateHabit();

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [schedule, setSchedule] = useState("FREQ=DAILY");
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
    createHabit.mutate(
      {
        title: title.trim(),
        projectId: effectiveProjectId as ProjectId,
        schedule,
        timezone,
        startDate,
        description: description.trim() || undefined,
        endDate: endDate || undefined,
      },
      {
        onSuccess: onClose,
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to create habit"),
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
        <h3 className="dialog-title">New Habit</h3>

        {error && <div className="dialog-error">{error}</div>}

        <div className="form-field">
          <label className="form-label" htmlFor="habit-title">
            Title *
          </label>
          <input
            id="habit-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Habit name"
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="habit-project">
            Project *
          </label>
          <select
            id="habit-project"
            className="input"
            value={effectiveProjectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="habit-schedule">
            Schedule *
          </label>
          <SchedulePresetPicker value={schedule} onChange={setSchedule} />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="form-label" htmlFor="habit-start">
              Start Date *
            </label>
            <input
              id="habit-start"
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="habit-end">
              End Date
            </label>
            <input
              id="habit-end"
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="habit-desc">
            Description
          </label>
          <textarea
            id="habit-desc"
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
            disabled={createHabit.isPending}
          >
            {createHabit.isPending ? "Creating…" : "Create Habit"}
          </button>
        </div>
      </div>
    </div>
  );
}
