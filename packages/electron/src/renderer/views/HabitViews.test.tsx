/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Habit, HabitFilter } from "@todu/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as hooks from "../hooks/useTodu.js";
import { HabitDetail } from "./HabitDetail.js";
import { HabitList } from "./HabitList.js";

vi.mock("../hooks/useTodu.js", () => ({
  useCheckHabit: vi.fn(),
  useUncheckHabit: vi.fn(),
  useHabitList: vi.fn(),
  useHabitDetail: vi.fn(),
  useHabitStreak: vi.fn(),
  useHabitHistory: vi.fn(),
  useProjects: vi.fn(),
  useUpdateHabit: vi.fn(),
  useDeleteHabit: vi.fn(),
  usePauseHabit: vi.fn(),
  useResumeHabit: vi.fn(),
}));
vi.mock("../components/MarkdownEditor.js", () => ({
  MarkdownEditor: ({ value }: { value: string }) => <div>{value}</div>,
}));
vi.mock("../components/CommentThread.js", () => ({
  CommentThread: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div>
      {entityType} comments: {entityId}
    </div>
  ),
}));

const habit: Habit = {
  id: "habit-1" as Habit["id"],
  title: "Read a chapter",
  projectId: "proj-1" as Habit["projectId"],
  schedule: "FREQ=DAILY",
  timezone: "America/Chicago",
  startDate: "2026-10-01",
  nextDue: "2026-10-24",
  paused: false,
  description: "Read something every day.",
  createdAt: "2026-10-01",
  updatedAt: "2026-10-23",
};
const check = vi.fn();
const uncheck = vi.fn();
const pause = vi.fn();
const resume = vi.fn();
const update = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(window, "todu", {
    configurable: true,
    value: { agent: { focusEntity: vi.fn(), clearFocusedEntity: vi.fn() } },
  });
  vi.mocked(hooks.useHabitList).mockReturnValue({ data: [habit], isLoading: false } as ReturnType<
    typeof hooks.useHabitList
  >);
  vi.mocked(hooks.useHabitDetail).mockReturnValue({ data: habit, isLoading: false } as ReturnType<
    typeof hooks.useHabitDetail
  >);
  vi.mocked(hooks.useProjects).mockReturnValue({
    data: [{ id: "proj-1", name: "Personal", status: "active" }],
  } as ReturnType<typeof hooks.useProjects>);
  vi.mocked(hooks.useHabitStreak).mockReturnValue({
    data: { current: 3, longest: 5, completedToday: false, totalCheckins: 10 },
  } as ReturnType<typeof hooks.useHabitStreak>);
  vi.mocked(hooks.useHabitHistory).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof hooks.useHabitHistory
  >);
  vi.mocked(hooks.useCheckHabit).mockReturnValue({
    mutate: check,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useCheckHabit>);
  vi.mocked(hooks.useUncheckHabit).mockReturnValue({
    mutate: uncheck,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useUncheckHabit>);
  vi.mocked(hooks.usePauseHabit).mockReturnValue({
    mutate: pause,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.usePauseHabit>);
  vi.mocked(hooks.useResumeHabit).mockReturnValue({
    mutate: resume,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useResumeHabit>);
  vi.mocked(hooks.useUpdateHabit).mockReturnValue({
    mutate: update,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useUpdateHabit>);
  vi.mocked(hooks.useDeleteHabit).mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<
    typeof hooks.useDeleteHabit
  >);
});
afterEach(cleanup);

describe("habit list", () => {
  it("defaults to active projects and allows all or a specific project", () => {
    vi.mocked(hooks.useProjects).mockReturnValue({
      data: [
        { id: "proj-1", name: "Personal", status: "active" },
        { id: "proj-done", name: "Finished", status: "done" },
      ],
    } as ReturnType<typeof hooks.useProjects>);
    vi.mocked(hooks.useHabitList).mockReturnValue({
      data: [
        habit,
        { ...habit, id: "habit-2", projectId: "proj-done", title: "Finished project habit" },
      ],
      isLoading: false,
    } as ReturnType<typeof hooks.useHabitList>);
    render(<HabitList onSelectHabit={vi.fn()} onCreateHabit={vi.fn()} />);
    expect((screen.getByLabelText("Project") as HTMLSelectElement).value).toBe("active-projects");
    expect(screen.getByText(habit.title)).toBeDefined();
    expect(screen.queryByText("Finished project habit")).toBeNull();
    expect(hooks.useHabitList).toHaveBeenLastCalledWith({});
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "" } });
    expect(screen.getByText("Finished project habit")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "proj-done" } });
    expect(hooks.useHabitList).toHaveBeenLastCalledWith({ projectId: "proj-done" });
  });

  it("combines project and schedule under the title and retains check-in without navigating", () => {
    const select = vi.fn();
    render(<HabitList onSelectHabit={select} onCreateHabit={vi.fn()} />);
    expect(screen.getByText("Personal · Daily")).toBeDefined();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Habit",
      "Status",
      "Streak",
      "Today",
      "Next due",
    ]);
    fireEvent.click(screen.getByTitle("Check in today"));
    expect(check).toHaveBeenCalledWith("habit-1");
    expect(select).not.toHaveBeenCalled();
  });

  it("clears all habit filters and retains search while results load", () => {
    const props = { onSelectHabit: vi.fn(), onCreateHabit: vi.fn() };
    const { rerender } = render(<HabitList {...props} />);
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "chapter" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "paused" } });
    fireEvent.change(screen.getByLabelText("Check-in"), { target: { value: "done" } });
    expect(hooks.useHabitList).toHaveBeenLastCalledWith({
      paused: true,
      checkedToday: true,
      search: "chapter",
    });
    vi.mocked(hooks.useHabitList).mockReturnValue({ isLoading: true } as ReturnType<
      typeof hooks.useHabitList
    >);
    rerender(<HabitList {...props} />);
    expect(screen.getByRole("searchbox")).toBe(search);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(hooks.useHabitList).toHaveBeenLastCalledWith({} satisfies HabitFilter);
  });
});

describe("habit detail", () => {
  it("lets a legacy habit without a project select an existing project", () => {
    vi.mocked(hooks.useHabitDetail).mockReturnValue({
      data: { ...habit, projectId: undefined },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useHabitDetail>);
    render(<HabitDetail habitId="habit-1" onBack={vi.fn()} />);
    expect(screen.getByText(/This habit has no project/)).toBeDefined();
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "proj-1" } });
    expect(update).toHaveBeenCalledWith({ id: "habit-1", input: { projectId: "proj-1" } });
  });

  it("opens Description first and keeps Comments and History available", () => {
    render(<HabitDetail habitId="habit-1" onBack={vi.fn()} />);
    expect(screen.getByText("Read something every day.")).toBeDefined();
    const tabs = screen
      .getAllByRole("button")
      .filter((button) =>
        ["Description", "Comments", "History"].includes(button.textContent ?? ""),
      );
    expect(tabs.map((button) => button.textContent)).toEqual([
      "Description",
      "Comments",
      "History",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    expect(screen.getByText("habit comments: habit-1")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText("Last 30 Days")).toBeDefined();
    expect(hooks.useHabitHistory).toHaveBeenCalledWith("habit-1", 30);
  });

  it("pauses and resumes through the labeled status control", () => {
    const { rerender } = render(<HabitDetail habitId="habit-1" onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "paused" } });
    expect(pause).toHaveBeenCalledWith("habit-1");
    vi.mocked(hooks.useHabitDetail).mockReturnValue({
      data: { ...habit, paused: true },
      isLoading: false,
    } as ReturnType<typeof hooks.useHabitDetail>);
    rerender(<HabitDetail habitId="habit-1" onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "active" } });
    expect(resume).toHaveBeenCalledWith("habit-1");
  });

  it("edits the schedule with Save and Cancel controls", () => {
    render(<HabitDetail habitId="habit-1" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit schedule" }));
    fireEvent.change(
      within(screen.getByRole("region", { name: "Edit habit schedule" })).getByRole("combobox"),
      { target: { value: "weekdays" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Edit habit schedule" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit schedule" }));
    fireEvent.change(
      within(screen.getByRole("region", { name: "Edit habit schedule" })).getByRole("combobox"),
      { target: { value: "weekdays" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(update).toHaveBeenCalledWith(
      { id: "habit-1", input: { schedule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
