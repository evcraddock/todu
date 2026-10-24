/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Actor } from "@todu/core/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AssigneesView } from "./AssigneesView.js";

let people: Actor[];
let client: QueryClient;
const create = vi.fn();
const rename = vi.fn();
const archive = vi.fn();
const restore = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  people = [
    { id: "actor-user" as Actor["id"], displayName: "User" },
    { id: "actor-reviewer" as Actor["id"], displayName: "Reviewer" },
    { id: "actor-old" as Actor["id"], displayName: "Old person", archived: true },
  ];
  create.mockImplementation(async (input: Actor) => {
    people.push(input);
    return { ok: true, value: input };
  });
  rename.mockImplementation(async (id: string, displayName: string) => {
    people = people.map((person) => (person.id === id ? { ...person, displayName } : person));
    return { ok: true, value: people.find((person) => person.id === id) };
  });
  for (const [mock, archived] of [
    [archive, true],
    [restore, false],
  ] as const) {
    mock.mockImplementation(async (id: string) => {
      people = people.map((person) => (person.id === id ? { ...person, archived } : person));
      return { ok: true, value: people.find((person) => person.id === id) };
    });
  }
  Object.defineProperty(window, "todu", {
    configurable: true,
    value: {
      actor: {
        list: vi.fn(async () => ({ ok: true, value: [...people] })),
        create,
        rename,
        archive,
        unarchive: restore,
      },
    },
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});

function open() {
  render(
    <QueryClientProvider client={client}>
      <AssigneesView />
    </QueryClientProvider>,
  );
}

it("lists active people by default and supports search and archived filters", async () => {
  open();
  expect(await screen.findByText("Reviewer")).toBeDefined();
  expect(screen.queryByText("Old person")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "actor-reviewer" } });
  expect(screen.queryByText("User")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByText("Old person")).toBeDefined();
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "archived" } });
  expect(screen.queryByText("Reviewer")).toBeNull();
  expect(screen.getByRole("button", { name: "Restore Old person" })).toBeDefined();
});

it("creates with a stable custom ID, renames, archives, and restores", async () => {
  open();
  await screen.findByText("Reviewer");
  fireEvent.click(screen.getByRole("button", { name: "+ Add assignee" }));
  const form = screen.getByRole("form", { name: "Add assignee" });
  fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Automation Bot" } });
  fireEvent.click(screen.getByText("Custom identifier (optional)"));
  fireEvent.change(within(form).getByLabelText("ID"), { target: { value: "actor-bot" } });
  fireEvent.click(within(form).getByRole("button", { name: "Add assignee" }));
  expect(await screen.findByText("Automation Bot")).toBeDefined();
  expect(create).toHaveBeenCalledWith({ id: "actor-bot", displayName: "Automation Bot" });
  fireEvent.click(screen.getByRole("button", { name: "Rename Reviewer" }));
  expect(screen.getByRole("dialog", { name: "Rename Assignee" })).toBeDefined();
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Reviewer");
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Lead Reviewer" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Lead Reviewer")).toBeDefined();
  expect(rename).toHaveBeenCalledWith("actor-reviewer", "Lead Reviewer");
  fireEvent.click(screen.getByRole("button", { name: "Archive Lead Reviewer" }));
  expect(archive).not.toHaveBeenCalled();
  const confirmation = screen.getByRole("dialog", { name: "Archive Assignee" });
  expect(confirmation.textContent).toContain("Archive Lead Reviewer?");
  fireEvent.click(within(confirmation).getByRole("button", { name: "Archive assignee" }));
  await waitFor(() => expect(screen.queryByText("Lead Reviewer")).toBeNull());
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "archived" } });
  fireEvent.click(screen.getByRole("button", { name: "Restore Lead Reviewer" }));
  await waitFor(() => expect(screen.queryByText("Lead Reviewer")).toBeNull());
  expect(archive).toHaveBeenCalledWith("actor-reviewer");
  expect(restore).toHaveBeenCalledWith("actor-reviewer");
});

it("generates an ID when none is supplied", async () => {
  open();
  await screen.findByText("Reviewer");
  fireEvent.click(screen.getByRole("button", { name: "+ Add assignee" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New person" } });
  fireEvent.click(screen.getByRole("button", { name: "Add assignee" }));
  expect(await screen.findByText("New person")).toBeDefined();
  expect(create).toHaveBeenCalledWith({
    id: expect.stringMatching(/^actor-[a-f0-9]{8}$/),
    displayName: "New person",
  });
});

it("opens a modal dialog and cancels with Escape without creating an assignee", async () => {
  open();
  await screen.findByText("Reviewer");
  fireEvent.click(screen.getByRole("button", { name: "+ Add assignee" }));
  const dialog = screen.getByRole("dialog", { name: "New Assignee" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Draft assignee" } });
  fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(create).not.toHaveBeenCalled();
});

it("keeps a failed creation open with the error and draft", async () => {
  create.mockResolvedValue({
    ok: false,
    error: { type: "validation", field: "id", message: "Already exists" },
  });
  open();
  await screen.findByText("Reviewer");
  fireEvent.click(screen.getByRole("button", { name: "+ Add assignee" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New person" } });
  fireEvent.click(screen.getByRole("button", { name: "Add assignee" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Already exists");
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("New person");
});

it("cancels a rename dialog without changing the assignee", async () => {
  open();
  await screen.findByText("Reviewer");
  fireEvent.click(screen.getByRole("button", { name: "Rename Reviewer" }));
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Draft name" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(rename).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Rename Reviewer" }));
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Reviewer");
  fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("preserves the rename draft and shows errors inside the dialog", async () => {
  rename.mockResolvedValue({
    ok: false,
    error: { type: "validation", field: "displayName", message: "Unable to rename" },
  });
  open();
  await screen.findByText("Reviewer");
  fireEvent.click(screen.getByRole("button", { name: "Rename Reviewer" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Lead Reviewer" } });
  fireEvent.submit(screen.getByRole("form", { name: "Rename assignee" }));
  const dialog = screen.getByRole("dialog", { name: "Rename Assignee" });
  expect((await within(dialog).findByRole("alert")).textContent).toContain("Unable to rename");
  expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe("Lead Reviewer");
});

it("cancels archiving without changing the assignee", async () => {
  open();
  await screen.findByText("Reviewer");
  fireEvent.click(screen.getByRole("button", { name: "Archive Reviewer" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(archive).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Archive Reviewer" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(archive).not.toHaveBeenCalled();
});

it("keeps archive errors in the confirmation dialog for retry", async () => {
  archive.mockResolvedValueOnce({
    ok: false,
    error: { type: "validation", message: "Unable to archive" },
  });
  open();
  await screen.findByText("Reviewer");
  fireEvent.click(screen.getByRole("button", { name: "Archive Reviewer" }));
  const dialog = screen.getByRole("dialog", { name: "Archive Assignee" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Archive assignee" }));
  expect((await within(dialog).findByRole("alert")).textContent).toContain("Unable to archive");
  fireEvent.click(within(dialog).getByRole("button", { name: "Archive assignee" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(archive).toHaveBeenCalledTimes(2);
});
