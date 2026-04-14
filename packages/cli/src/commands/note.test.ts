import type { Note } from "@todu/core";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliDaemonInvoker } from "../daemon-command-client.js";
import { registerNoteCommands } from "./note.js";

describe("note commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("passes author actor IDs through on note add", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "note.create") {
        return {
          ok: true,
          value: {
            id: "note-1",
            content: "Imported note",
            author: "user",
            authorActorId: "actor-user",
            tags: [],
            createdAt: "2026-03-14T15:00:00.000Z",
          } satisfies Note,
        };
      }
      if (method === "actor.list") {
        return {
          ok: true,
          value: [{ id: "actor-user", displayName: "user" }],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const invokeDaemon = invokeDaemonMock as unknown as CliDaemonInvoker;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerNoteCommands(program, invokeDaemon);

    await program.parseAsync(["note", "add", "Imported note", "--author-actor", "actor-user"], {
      from: "user",
    });

    expect(invokeDaemonMock).toHaveBeenCalledWith("note.create", {
      input: {
        content: "Imported note",
        entityType: undefined,
        entityId: undefined,
        tags: undefined,
        author: undefined,
        authorActorId: "actor-user",
        createdAt: undefined,
      },
    });
    expect(logSpy).toHaveBeenCalled();
  });

  it("rejects conflicting note author flags", async () => {
    const invokeDaemon = vi.fn() as unknown as CliDaemonInvoker;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerNoteCommands(program, invokeDaemon);

    await program.parseAsync(
      ["note", "add", "x", "--author", "user", "--author-actor", "actor-user"],
      {
        from: "user",
      },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Error: --author and --author-actor cannot be used together",
    );
    expect(process.exitCode).toBe(1);
  });

  it("passes habit attachment through on note add", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "note.create") {
        return {
          ok: true,
          value: {
            id: "note-1",
            content: "Floss method: Water Pick",
            author: "user",
            entityType: "habit",
            entityId: "hab-123",
            tags: [],
            createdAt: "2026-03-14T15:00:00.000Z",
          } satisfies Note,
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const invokeDaemon = invokeDaemonMock as unknown as CliDaemonInvoker;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerNoteCommands(program, invokeDaemon);

    await program.parseAsync(
      ["--format", "json", "note", "add", "Floss method: Water Pick", "--habit", "hab-123"],
      { from: "user" },
    );

    expect(invokeDaemonMock).toHaveBeenCalledWith("note.create", {
      input: {
        content: "Floss method: Water Pick",
        entityType: "habit",
        entityId: "hab-123",
        tags: undefined,
        author: undefined,
        authorActorId: undefined,
        createdAt: undefined,
      },
    });
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject({
      entityType: "habit",
      entityId: "hab-123",
    });
  });

  it("passes habit filtering through on note list", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "note.list") {
        return {
          ok: true,
          value: [
            {
              id: "note-1",
              content: "Floss method: Water Pick",
              author: "user",
              entityType: "habit",
              entityId: "hab-123",
              tags: [],
              createdAt: "2026-03-14T15:00:00.000Z",
            } satisfies Note,
          ],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const invokeDaemon = invokeDaemonMock as unknown as CliDaemonInvoker;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerNoteCommands(program, invokeDaemon);

    await program.parseAsync(["--format", "json", "note", "list", "--habit", "hab-123"], {
      from: "user",
    });

    expect(invokeDaemonMock).toHaveBeenCalledWith("note.list", {
      filter: {
        entityType: "habit",
        entityId: "hab-123",
        tag: undefined,
        author: undefined,
        authorActorId: undefined,
        journal: undefined,
        createdFrom: undefined,
        createdTo: undefined,
      },
    });
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject([
      {
        entityType: "habit",
        entityId: "hab-123",
      },
    ]);
  });

  it("passes date range filtering through on note list", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "note.list") {
        return {
          ok: true,
          value: [],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const invokeDaemon = invokeDaemonMock as unknown as CliDaemonInvoker;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerNoteCommands(program, invokeDaemon);

    await program.parseAsync(
      ["--format", "json", "note", "list", "--from", "2026-03-01", "--to", "2026-03-31"],
      {
        from: "user",
      },
    );

    expect(invokeDaemonMock).toHaveBeenCalledWith("note.list", {
      filter: {
        entityType: undefined,
        entityId: undefined,
        tag: undefined,
        author: undefined,
        authorActorId: undefined,
        journal: undefined,
        createdFrom: "2026-03-01",
        createdTo: "2026-03-31",
      },
    });
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual([]);
  });

  it("passes journal filtering through on note list", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "note.list") {
        return {
          ok: true,
          value: [],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const invokeDaemon = invokeDaemonMock as unknown as CliDaemonInvoker;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerNoteCommands(program, invokeDaemon);

    await program.parseAsync(["--format", "json", "note", "list", "--journal"], {
      from: "user",
    });

    expect(invokeDaemonMock).toHaveBeenCalledWith("note.list", {
      filter: {
        entityType: undefined,
        entityId: undefined,
        tag: undefined,
        author: undefined,
        authorActorId: undefined,
        journal: true,
        createdFrom: undefined,
        createdTo: undefined,
      },
    });
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual([]);
  });
});
