/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RecurringTemplate } from "@todu/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as hooks from "../hooks/useTodu.js";
import { CreateRecurringDialog } from "./CreateRecurringDialog.js";
import { RecurringDetail } from "./RecurringDetail.js";
import { RecurringList } from "./RecurringList.js";

vi.mock("../hooks/useTodu.js", () => ({
  useProjects: vi.fn(),
  useCreateRecurring: vi.fn(),
  useRecurringDetail: vi.fn(),
  useUpdateRecurring: vi.fn(),
  useDeleteRecurring: vi.fn(),
  usePauseRecurring: vi.fn(),
  useResumeRecurring: vi.fn(),
  useUpcoming: vi.fn(),
  useGenerateOccurrence: vi.fn(),
  useRecurringList: vi.fn(),
}));

vi.mock("../components/SchedulePresetPicker.js", () => ({
  SchedulePresetPicker: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <input aria-label="Schedule preset" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("../components/PriorityChip.js", () => ({
  PriorityChip: ({ priority }: { priority: string }) => <span>{priority}</span>,
}));

vi.mock("../components/CommentThread.js", () => ({
  CommentThread: () => <div>Comments</div>,
}));

vi.mock("../components/ConfirmDialog.js", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("../components/MarkdownEditor.js", () => ({
  MarkdownEditor: () => <div>Markdown Editor</div>,
}));

vi.mock("../components/TabBar.js", () => ({
  TabBar: ({ tabs }: { tabs: Array<{ id: string; label: string }> }) => (
    <div>
      {tabs.map((tab) => (
        <span key={tab.id}>{tab.label}</span>
      ))}
    </div>
  ),
}));

function makeTemplate(overrides: Partial<RecurringTemplate> = {}): RecurringTemplate {
  return {
    id: "rec-1" as RecurringTemplate["id"],
    title: "Water plants",
    projectId: "proj-1" as RecurringTemplate["projectId"],
    labels: [],
    priority: "medium",
    schedule: "FREQ=WEEKLY",
    timezone: "UTC",
    startDate: "2026-03-01",
    endDate: undefined,
    nextDue: "2026-03-08",
    skippedDates: [],
    paused: false,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

const createRecurringMutate = vi.fn();
const updateRecurringMutate = vi.fn();
const deleteRecurringMutate = vi.fn();
const pauseRecurringMutate = vi.fn();
const resumeRecurringMutate = vi.fn();
const generateOccurrenceMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  Object.defineProperty(window, "todu", {
    configurable: true,
    value: {
      agent: {
        focusEntity: vi.fn().mockResolvedValue(undefined),
        clearFocusedEntity: vi.fn().mockResolvedValue(undefined),
      },
    },
  });

  vi.mocked(hooks.useProjects).mockReturnValue({
    data: [{ id: "proj-1", name: "Home" }],
  } as ReturnType<typeof hooks.useProjects>);

  vi.mocked(hooks.useCreateRecurring).mockReturnValue({
    mutate: createRecurringMutate,
    isPending: false,
  } as ReturnType<typeof hooks.useCreateRecurring>);

  vi.mocked(hooks.useRecurringDetail).mockReturnValue({
    data: makeTemplate(),
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof hooks.useRecurringDetail>);

  vi.mocked(hooks.useUpdateRecurring).mockReturnValue({
    mutate: updateRecurringMutate,
  } as ReturnType<typeof hooks.useUpdateRecurring>);

  vi.mocked(hooks.useDeleteRecurring).mockReturnValue({
    mutate: deleteRecurringMutate,
  } as ReturnType<typeof hooks.useDeleteRecurring>);

  vi.mocked(hooks.usePauseRecurring).mockReturnValue({
    mutate: pauseRecurringMutate,
  } as ReturnType<typeof hooks.usePauseRecurring>);

  vi.mocked(hooks.useResumeRecurring).mockReturnValue({
    mutate: resumeRecurringMutate,
  } as ReturnType<typeof hooks.useResumeRecurring>);

  vi.mocked(hooks.useUpcoming).mockReturnValue({
    data: [],
    isLoading: false,
  } as ReturnType<typeof hooks.useUpcoming>);

  vi.mocked(hooks.useGenerateOccurrence).mockReturnValue({
    mutate: generateOccurrenceMutate,
    isPending: false,
  } as ReturnType<typeof hooks.useGenerateOccurrence>);

  vi.mocked(hooks.useRecurringList).mockReturnValue({
    data: [makeTemplate()],
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof hooks.useRecurringList>);
});

afterEach(() => {
  cleanup();
});

describe("CreateRecurringDialog missPolicy", () => {
  it("submits rollForward when selected in the create flow", () => {
    render(<CreateRecurringDialog onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Title *"), {
      target: { value: "Water plants" },
    });
    fireEvent.change(screen.getByLabelText("Miss Policy"), {
      target: { value: "rollForward" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Template" }));

    expect(createRecurringMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Water plants",
        missPolicy: "rollForward",
      }),
      expect.any(Object),
    );
  });

  it("defaults the create flow to accumulate", () => {
    render(<CreateRecurringDialog onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Title *"), {
      target: { value: "Pay rent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Template" }));

    expect(screen.getByText("Missed occurrences stack and catch up.")).toBeDefined();
    expect(createRecurringMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Pay rent",
        missPolicy: "accumulate",
      }),
      expect.any(Object),
    );
  });
});

describe("RecurringDetail missPolicy", () => {
  it("shows accumulate for legacy templates without a stored missPolicy and updates edits", () => {
    vi.mocked(hooks.useRecurringDetail).mockReturnValue({
      data: makeTemplate({ missPolicy: undefined }),
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof hooks.useRecurringDetail>);

    render(<RecurringDetail templateId="rec-1" onBack={() => {}} />);

    const select = screen.getByLabelText("Miss Policy") as HTMLSelectElement;
    expect(select.value).toBe("accumulate");
    expect(screen.getByText("Missed occurrences stack and catch up.")).toBeDefined();

    fireEvent.change(select, { target: { value: "rollForward" } });

    expect(updateRecurringMutate).toHaveBeenCalledWith({
      id: "rec-1",
      input: { missPolicy: "rollForward" },
    });
  });

  it("keeps recurring detail focused on description and upcoming tabs only", () => {
    render(<RecurringDetail templateId="rec-1" onBack={() => {}} />);

    expect(screen.getByText("Description")).toBeDefined();
    expect(screen.getByText("Upcoming")).toBeDefined();
    expect(screen.queryByText("Comments")).toBeNull();
  });
});

describe("RecurringList missPolicy", () => {
  it("shows current missPolicy in the list and defaults legacy values to accumulate", () => {
    vi.mocked(hooks.useRecurringList).mockReturnValue({
      data: [
        makeTemplate({ id: "rec-1" as RecurringTemplate["id"], title: "Water plants" }),
        makeTemplate({
          id: "rec-2" as RecurringTemplate["id"],
          title: "Weekly review",
          missPolicy: "rollForward",
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof hooks.useRecurringList>);

    render(
      <RecurringList
        onSelectTemplate={() => {}}
        onCreateTemplate={() => {}}
        externalFilter={null}
      />,
    );

    expect(screen.getByText("Miss Policy")).toBeDefined();
    expect(screen.getByLabelText("Miss Policy accumulate")).toBeDefined();
    expect(screen.getByLabelText("Miss Policy rollForward")).toBeDefined();
    expect(screen.getByText("stacks missed occurrences")).toBeDefined();
    expect(screen.getByText("latest due only")).toBeDefined();
  });
});
