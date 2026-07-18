import type { Task } from "@todu/core";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliDaemonInvoker } from "../daemon-command-client.js";
import { registerTaskCommands } from "./task.js";

describe("task commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("displays the task ID in task details", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "task.get") {
        return {
          ok: true,
          value: {
            id: "task-1",
            title: "Task details",
            status: "active",
            priority: "medium",
            projectId: "proj-1",
            labels: [],
            assigneeActorIds: [],
            assignees: [],
            createdAt: "2026-03-01T00:00:00.000Z",
            updatedAt: "2026-03-01T00:00:00.000Z",
            notes: [],
          },
        };
      }
      if (method === "project.list" || method === "actor.list") {
        return { ok: true, value: [] };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const invokeDaemon = invokeDaemonMock as unknown as CliDaemonInvoker;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerTaskCommands(program, invokeDaemon);

    await program.parseAsync(["task", "show", "task-1"], { from: "user" });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("ID:          task-1"));
  });

  it("passes actor assignee updates through on task update", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "task.update") {
        return {
          ok: true,
          value: {
            id: "task-1",
            title: "Actor task",
            status: "active",
            priority: "medium",
            projectId: "proj-1",
            labels: [],
            assigneeActorIds: ["actor-user"],
            assignees: [],
            createdAt: "2026-03-01T00:00:00.000Z",
            updatedAt: "2026-03-01T00:00:00.000Z",
          },
        };
      }
      if (method === "project.list") {
        return { ok: true, value: [] };
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
    registerTaskCommands(program, invokeDaemon);

    await program.parseAsync(["task", "update", "task-1", "--assignee-actor", "actor-user"], {
      from: "user",
    });

    expect(invokeDaemonMock).toHaveBeenCalledWith("task.update", {
      id: "task-1",
      input: expect.objectContaining({ assigneeActorIds: ["actor-user"] }),
    });
    expect(logSpy).toHaveBeenCalled();
  });

  it("rejects conflicting assignee update flags", async () => {
    const invokeDaemon = vi.fn() as unknown as CliDaemonInvoker;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerTaskCommands(program, invokeDaemon);

    await program.parseAsync(
      ["task", "update", "task-1", "--assignee-actor", "actor-user", "--clear-assignees"],
      {
        from: "user",
      },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Error: --assignee-actor and --clear-assignees cannot be used together",
    );
    expect(process.exitCode).toBe(1);
  });

  it("passes created-at date range filtering through on task list", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "task.list") {
        return {
          ok: true,
          value: [] satisfies Task[],
        };
      }
      if (method === "project.list" || method === "actor.list") {
        return { ok: true, value: [] };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const invokeDaemon = invokeDaemonMock as unknown as CliDaemonInvoker;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerTaskCommands(program, invokeDaemon);

    await program.parseAsync(
      ["--format", "json", "task", "list", "--from", "2026-03-01", "--to", "2026-03-31"],
      {
        from: "user",
      },
    );

    expect(invokeDaemonMock).toHaveBeenCalledWith("task.list", {
      filter: {
        projectId: undefined,
        status: undefined,
        priority: undefined,
        label: undefined,
        createdFrom: "2026-03-01",
        createdTo: "2026-03-31",
        overdue: undefined,
        today: undefined,
      },
      sort: undefined,
    });
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual([]);
  });

  it("passes updated-at date range filtering through on task list", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "task.list") {
        return {
          ok: true,
          value: [] satisfies Task[],
        };
      }
      if (method === "project.list" || method === "actor.list") {
        return { ok: true, value: [] };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const invokeDaemon = invokeDaemonMock as unknown as CliDaemonInvoker;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerTaskCommands(program, invokeDaemon);

    await program.parseAsync(
      [
        "--format",
        "json",
        "task",
        "list",
        "--status",
        "done",
        "--updated-from",
        "2026-03-01",
        "--updated-to",
        "2026-03-31",
      ],
      {
        from: "user",
      },
    );

    expect(invokeDaemonMock).toHaveBeenCalledWith("task.list", {
      filter: expect.objectContaining({
        updatedFrom: "2026-03-01",
        updatedTo: "2026-03-31",
        status: "done",
      }),
      sort: undefined,
    });
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual([]);
  });
});
