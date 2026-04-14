import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliDaemonInvoker } from "../daemon-command-client.js";
import { registerActorCommands } from "./actor.js";

describe("actor commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("passes create input through to the daemon", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "actor.create") {
        return {
          ok: true,
          value: {
            id: "actor-reviewer",
            displayName: "Reviewer",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const invokeDaemon = invokeDaemonMock as unknown as CliDaemonInvoker;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerActorCommands(program, invokeDaemon);

    await program.parseAsync(["actor", "create", "--id", "actor-reviewer", "--name", "Reviewer"], {
      from: "user",
    });

    expect(invokeDaemonMock).toHaveBeenCalledWith("actor.create", {
      input: {
        id: "actor-reviewer",
        displayName: "Reviewer",
      },
    });
    expect(logSpy).toHaveBeenCalled();
  });

  it("prints explicit archived state in actor list json output", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "actor.list") {
        return {
          ok: true,
          value: [
            { id: "actor-user", displayName: "user" },
            { id: "actor-reviewer", displayName: "Reviewer", archived: true },
          ],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const invokeDaemon = invokeDaemonMock as unknown as CliDaemonInvoker;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerActorCommands(program, invokeDaemon);

    await program.parseAsync(["--format", "json", "actor", "list"], { from: "user" });

    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual([
      { id: "actor-user", displayName: "user", archived: false },
      { id: "actor-reviewer", displayName: "Reviewer", archived: true },
    ]);
  });

  it("passes rename input through to the daemon", async () => {
    const invokeDaemonMock = vi.fn(async (method: string) => {
      if (method === "actor.rename") {
        return {
          ok: true,
          value: {
            id: "actor-reviewer",
            displayName: "Lead Reviewer",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });
    const invokeDaemon = invokeDaemonMock as unknown as CliDaemonInvoker;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command();
    program.name("todu").option("--format <type>", "output format (text or json)", "text");
    registerActorCommands(program, invokeDaemon);

    await program.parseAsync(["actor", "rename", "actor-reviewer", "--name", "Lead Reviewer"], {
      from: "user",
    });

    expect(invokeDaemonMock).toHaveBeenCalledWith("actor.rename", {
      id: "actor-reviewer",
      displayName: "Lead Reviewer",
    });
    expect(logSpy).toHaveBeenCalled();
  });
});
