/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CreateProjectDialog } from "./CreateProjectDialog.js";
import { CreateTaskDialog } from "./CreateTaskDialog.js";

const mutations = vi.hoisted(() => ({ task: vi.fn(), project: vi.fn() }));
vi.mock("../hooks/useTodu.js", () => ({
  useCreateTask: () => ({ mutate: mutations.task, isPending: false }),
  useCreateProject: () => ({ mutate: mutations.project, isPending: false }),
  useProjects: () => ({ data: [{ id: "proj-1", name: "Demo" }] }),
}));
vi.mock("../components/MarkdownEditor.js", () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      aria-label="Description markdown"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("creates a project with the Markdown editor's description", () => {
  render(<CreateProjectDialog onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Project preview" } });
  fireEvent.change(screen.getByLabelText("Description markdown"), {
    target: { value: "## Purpose\n\nDeliver **clearer planning**." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create", exact: true }));
  expect(mutations.project).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Project preview",
      description: "## Purpose\n\nDeliver **clearer planning**.",
    }),
    expect.anything(),
  );
});

it("creates a task with the Markdown editor's description", () => {
  render(<CreateTaskDialog onClose={vi.fn()} defaultProjectId="proj-1" />);
  fireEvent.change(screen.getByLabelText("Title *"), { target: { value: "Task preview" } });
  fireEvent.change(screen.getByLabelText("Description markdown"), {
    target: { value: "Complete the **draft**.\n\n- Review results" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create Task", exact: true }));
  expect(mutations.task).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Task preview",
      projectId: "proj-1",
      description: "Complete the **draft**.\n\n- Review results",
    }),
    expect.anything(),
  );
});
