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

  it("passes created-at date range filtering through on task list", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "task.list") {
        return {
          ok: true,
          value: [] satisfies Task[],
        };
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
