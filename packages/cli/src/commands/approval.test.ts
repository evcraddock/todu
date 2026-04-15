import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliDaemonInvoker } from "../daemon-command-client.js";
import { registerApprovalCommands } from "./approval.js";

describe("approval commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("passes list filters through to the daemon", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "approval.list") {
        return { ok: true, value: [] };
      }
      throw new Error(`Unexpected method: ${method}`);
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerApprovalCommands(program, invokeDaemonMock as unknown as CliDaemonInvoker);

    await program.parseAsync(["--format", "json", "approval", "list", "--kind", "task"], {
      from: "user",
    });

    expect(invokeDaemonMock).toHaveBeenCalledWith("approval.list", {
      filter: {
        kind: "taskDescription",
      },
    });
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual([]);
  });

  it("rejects invalid approval kinds", async () => {
    const invokeDaemon = vi.fn() as unknown as CliDaemonInvoker;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerApprovalCommands(program, invokeDaemon);

    await program.parseAsync(["approval", "list", "--kind", "weird"], { from: "user" });

    expect(errorSpy).toHaveBeenCalledWith("Error: invalid approval kind: weird");
    expect(process.exitCode).toBe(1);
  });

  it("passes task description approvals through to the daemon", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "approval.approveTaskDescription") {
        return {
          ok: true,
          value: {
            kind: "taskDescription",
            state: "approved",
            taskId: "task-1",
            taskTitle: "Imported task",
            projectId: "proj-1",
            contentPreview: "Imported instructions",
          },
        };
      }
      if (method === "project.list") {
        return { ok: true, value: [] };
      }
      if (method === "actor.list") {
        return { ok: true, value: [] };
      }
      throw new Error(`Unexpected method: ${method}`);
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerApprovalCommands(program, invokeDaemonMock as unknown as CliDaemonInvoker);

    await program.parseAsync(["approval", "approve", "task-description", "task-1"], {
      from: "user",
    });

    expect(invokeDaemonMock).toHaveBeenCalledWith("approval.approveTaskDescription", {
      taskId: "task-1",
    });
    expect(logSpy).toHaveBeenCalled();
  });
});
