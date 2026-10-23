/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Note } from "@todu/core/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as hooks from "../hooks/useTodu.js";
import { journalPreview } from "../lib/journal-preview.js";
import { JournalDetail } from "./JournalDetail.js";
import { JournalEditor } from "./JournalEditor.js";
import { JournalList } from "./JournalList.js";

vi.mock("../hooks/useTodu.js", () => ({
  useNotes: vi.fn(),
  useCreateNote: vi.fn(),
  useUpdateNote: vi.fn(),
}));
vi.mock("../components/MarkdownEditor.js", () => ({
  MarkdownEditor: ({
    value,
    editable = true,
    onChange,
  }: {
    value: string;
    editable?: boolean;
    onChange?: (value: string) => void;
  }) =>
    editable ? (
      <textarea
        aria-label="Entry content"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
    ) : (
      <div>{value}</div>
    ),
}));

const note: Note = {
  id: "note-1" as Note["id"],
  content: "# Weekly reflection\n\nFinished the **garden** plan.",
  author: "User",
  tags: ["reflection"],
  createdAt: "2026-10-23T15:00:00.000Z",
  updatedAt: "2026-10-23T15:00:00.000Z",
};
const older: Note = {
  ...note,
  id: "note-2" as Note["id"],
  content: "A quiet morning walk.",
  tags: [],
  createdAt: "2026-10-22T15:00:00.000Z",
};
const create = vi.fn();
const update = vi.fn();
const listProps = { timezone: "America/Chicago", onCreateEntry: vi.fn(), onViewEntry: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T16:00:00Z"));
  vi.mocked(hooks.useNotes).mockReturnValue({ data: [older, note], isLoading: false } as ReturnType<
    typeof hooks.useNotes
  >);
  vi.mocked(hooks.useCreateNote).mockReturnValue({
    mutate: create,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useCreateNote>);
  vi.mocked(hooks.useUpdateNote).mockReturnValue({
    mutate: update,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useUpdateNote>);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("provides plain excerpts and opens the selected entry in date order", () => {
  render(<JournalList {...listProps} />);
  const excerpt = screen.getByRole("button", {
    name: /Weekly reflection Finished the garden plan/,
  });
  expect(
    excerpt.compareDocumentPosition(screen.getByRole("button", { name: /quiet morning/ })) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.click(excerpt);
  expect(listProps.onViewEntry).toHaveBeenCalledWith(note);
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "oldest" } });
  expect(
    screen.getByRole("button", { name: /quiet morning/ }).compareDocumentPosition(excerpt) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("combines search and tag filters and retains search through loading", () => {
  const { rerender } = render(<JournalList {...listProps} />);
  const search = screen.getByRole("searchbox");
  fireEvent.change(search, { target: { value: "garden" } });
  fireEvent.change(screen.getByLabelText("Tag"), { target: { value: "reflection" } });
  expect(screen.queryByRole("button", { name: /quiet morning/ })).toBeNull();
  expect(screen.getByRole("heading", { name: "Journal 1" })).toBeDefined();
  vi.mocked(hooks.useNotes).mockReturnValue({ isLoading: true } as ReturnType<
    typeof hooks.useNotes
  >);
  rerender(<JournalList {...listProps} />);
  expect(screen.getByRole("searchbox")).toBe(search);
  expect((search as HTMLInputElement).value).toBe("garden");
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect((search as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("Tag") as HTMLSelectElement).value).toBe("");
});

it("requests the selected week's timezone boundaries and returns to this week", () => {
  render(<JournalList {...listProps} />);
  const original = vi.mocked(hooks.useNotes).mock.lastCall?.[0];
  fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
  expect(hooks.useNotes).toHaveBeenLastCalledWith(
    expect.objectContaining({
      createdFrom: "2026-10-11T05:00:00.000Z",
      createdTo: "2026-10-18T04:59:59.999Z",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "This week" }));
  expect(hooks.useNotes).toHaveBeenLastCalledWith(original);
  expect((screen.getByRole("button", { name: "Next week" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it("shows detail content with timezone and hides empty tags", () => {
  const edit = vi.fn();
  render(<JournalDetail note={older} timezone="America/Chicago" onBack={vi.fn()} onEdit={edit} />);
  expect(screen.getByRole("region", { name: "Journal entry" }).textContent).toBe(older.content);
  expect(screen.getByText(/America\/Chicago/)).toBeDefined();
  expect(screen.queryByText("Tags")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit entry" }));
  expect(edit).toHaveBeenCalledWith(older);
});

it("makes tags optional and saves trimmed Markdown with deduplicated tags", () => {
  const close = vi.fn();
  render(<JournalEditor timezone="America/Chicago" onClose={close} />);
  expect(screen.queryByLabelText("Tags")).toBeNull();
  fireEvent.change(screen.getByLabelText("Entry content"), {
    target: { value: "  **A good day.**  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add tags" }));
  fireEvent.change(screen.getByLabelText(/^Tags/), {
    target: { value: "ideas, reflection, ideas" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  expect(create).toHaveBeenCalledWith(
    { content: "**A good day.**", tags: ["ideas", "reflection"] },
    expect.objectContaining({ onSuccess: close }),
  );
});

it("can remove existing tags without changing the entry identity", () => {
  render(<JournalEditor note={note} timezone="America/Chicago" onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
  fireEvent.change(screen.getByLabelText(/^Tags/), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  expect(update).toHaveBeenCalledWith(
    { id: note.id, input: { content: note.content, tags: [] } },
    expect.any(Object),
  );
});

it("reduces Markdown to a bounded, readable excerpt", () => {
  expect(journalPreview("# Heading\n- **Bold** [link](https://example.com) `code`")).toBe(
    "Heading Bold link code",
  );
  expect(journalPreview("  ")).toBe("Empty entry");
  expect(journalPreview("a".repeat(300))).toHaveLength(240);
});
