/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "./FilterBar.js";

vi.mock("../hooks/useTodu.js", () => ({
  useProjects: () => ({ data: [] }),
  useActors: () => ({
    data: [
      { id: "actor-a", displayName: "Reviewer" },
      { id: "actor-old", displayName: "Former reviewer", archived: true },
    ],
  }),
}));
afterEach(cleanup);

describe("task filters", () => {
  it("selects an assignee or unassigned tasks while preserving other filters", () => {
    const change = vi.fn();
    render(<FilterBar filter={{ status: "waiting", search: "layout" }} onFilterChange={change} />);
    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "actor-a" } });
    expect(change).toHaveBeenLastCalledWith({
      status: "waiting",
      search: "layout",
      assignee: "actor-a",
    });
    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "unassigned" } });
    expect(change).toHaveBeenLastCalledWith({
      status: "waiting",
      search: "layout",
      assignee: "unassigned",
    });
    expect(screen.getByRole("option", { name: "Former reviewer (archived)" })).toBeDefined();
  });

  it("selects all unfinished statuses with Open tasks while retaining search", () => {
    const onFilterChange = vi.fn();
    render(<FilterBar filter={{ search: "homepage" }} onFilterChange={onFilterChange} />);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "open" } });
    expect(onFilterChange).toHaveBeenCalledWith({
      search: "homepage",
      status: ["active", "inprogress", "waiting"],
    });
  });

  it("switches between time filters without leaving a hidden intersection", () => {
    const onFilterChange = vi.fn();
    render(
      <FilterBar filter={{ overdue: true, priority: "high" }} onFilterChange={onFilterChange} />,
    );
    fireEvent.change(screen.getByLabelText("When"), { target: { value: "today" } });
    expect(onFilterChange).toHaveBeenCalledWith({
      overdue: undefined,
      today: true,
      priority: "high",
    });
  });

  it("clears all filters including filters without a visible control", () => {
    const onFilterChange = vi.fn();
    render(
      <FilterBar
        filter={{ search: "homepage", label: "demo", status: ["done"] }}
        onFilterChange={onFilterChange}
      />,
    );
    fireEvent.click(screen.getByText("Clear filters"));
    expect(onFilterChange).toHaveBeenCalledWith({ activeProjects: false });
  });

  it("searches task text while retaining the selected status", () => {
    const onFilterChange = vi.fn();
    render(<FilterBar filter={{ status: "waiting" }} onFilterChange={onFilterChange} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "color palette" } });
    expect(onFilterChange).toHaveBeenCalledWith({ status: "waiting", search: "color palette" });
  });
});
