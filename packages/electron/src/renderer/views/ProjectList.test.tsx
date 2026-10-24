/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Project } from "@todu/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as hooks from "../hooks/useTodu.js";
import { ProjectList } from "./ProjectList.js";

vi.mock("../hooks/useTodu.js", () => ({ useProjects: vi.fn(), useTasks: vi.fn() }));
const projects: Project[] = [
  {
    id: "proj-z" as Project["id"],
    name: "Zulu",
    status: "active",
    priority: "high",
    authorizedAssigneeActorIds: [],
    createdAt: "2026-10-23",
    updatedAt: "2026-10-23",
  },
  {
    id: "proj-a" as Project["id"],
    name: "Alpha",
    status: "active",
    priority: "low",
    authorizedAssigneeActorIds: [],
    createdAt: "2026-10-22",
    updatedAt: "2026-10-22",
  },
];
beforeEach(() => {
  vi.mocked(hooks.useProjects).mockReturnValue({ data: projects, isLoading: false } as ReturnType<
    typeof hooks.useProjects
  >);
  vi.mocked(hooks.useTasks).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof hooks.useTasks
  >);
});
afterEach(cleanup);

describe("ProjectList", () => {
  it("shows simplified project rows and applies explicit priority sorting", () => {
    const select = vi.fn();
    render(<ProjectList onSelectProject={select} onCreateProject={vi.fn()} />);
    expect(screen.queryByText("Created")).toBeNull();
    expect(screen.getAllByRole("row")[1].textContent).toContain("Alpha");
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "priority" } });
    expect(screen.getAllByRole("row")[1].textContent).toContain("Zulu");
    fireEvent.keyDown(screen.getAllByRole("row")[1], { key: "Enter" });
    expect(select).toHaveBeenCalledWith("proj-z");
  });

  it("retains the search field when a filter change loads new results", () => {
    const props = { onSelectProject: vi.fn(), onCreateProject: vi.fn() };
    const { rerender } = render(<ProjectList {...props} />);
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "Alpha" } });
    vi.mocked(hooks.useProjects).mockReturnValue({ isLoading: true } as ReturnType<
      typeof hooks.useProjects
    >);
    rerender(<ProjectList {...props} />);
    expect(screen.getByRole("searchbox")).toBe(search);
    expect(screen.getByText("Loading projects…")).toBeDefined();
    fireEvent.click(screen.getByText("Clear filters"));
    expect((search as HTMLInputElement).value).toBe("");
  });
});
