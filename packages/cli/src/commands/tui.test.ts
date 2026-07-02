import path from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { registerTuiCommand, resolveTuiLaunchTarget } from "./tui.js";

describe("tui command", () => {
  it("resolves an installed @todu/tui package entrypoint", () => {
    const entrypoint = "/opt/todu/node_modules/@todu/tui/dist/index.js";
    const target = resolveTuiLaunchTarget(["--help"], {
      nodePath: "/usr/bin/node",
      fileExists: (filePath) => filePath === entrypoint,
      resolveSpecifier: (specifier) => {
        if (specifier === "@todu/tui") {
          return entrypoint;
        }
        throw new Error(`unexpected specifier: ${specifier}`);
      },
    });

    expect(target).toEqual({
      command: "/usr/bin/node",
      args: [entrypoint, "--help"],
      source: "package",
    });
  });

  it("resolves a built workspace TUI when the package entrypoint is not installed", () => {
    const cliEntrypoint = path.join("/repo", "packages", "cli", "dist", "index.js");
    const tuiEntrypoint = path.join("/repo", "packages", "tui", "dist", "index.js");
    const target = resolveTuiLaunchTarget([], {
      cliEntrypointPath: cliEntrypoint,
      nodePath: "/usr/bin/node",
      fileExists: (filePath) => filePath === tuiEntrypoint,
      resolveSpecifier: () => {
        throw new Error("not installed");
      },
    });

    expect(target).toEqual({
      command: "/usr/bin/node",
      args: [tuiEntrypoint],
      source: "workspace-dist",
    });
  });

  it("resolves a source workspace TUI through tsx when dist is not built", () => {
    const cliEntrypoint = path.join("/repo", "packages", "cli", "dist", "index.js");
    const tuiSource = path.join("/repo", "packages", "tui", "src", "index.tsx");
    const tsxPackageJson = path.join("/repo", "node_modules", "tsx", "package.json");
    const tsxEntrypoint = path.join("/repo", "node_modules", "tsx", "dist", "cli.mjs");
    const target = resolveTuiLaunchTarget(["--version"], {
      cliEntrypointPath: cliEntrypoint,
      nodePath: "/usr/bin/node",
      fileExists: (filePath) => filePath === tuiSource || filePath === tsxEntrypoint,
      resolveSpecifier: (specifier) => {
        if (specifier === "tsx/package.json") {
          return tsxPackageJson;
        }
        throw new Error("not installed");
      },
    });

    expect(target).toEqual({
      command: "/usr/bin/node",
      args: [tsxEntrypoint, tuiSource, "--version"],
      source: "workspace-source",
    });
  });

  it("returns null when no TUI entrypoint is available", () => {
    const target = resolveTuiLaunchTarget([], {
      cliEntrypointPath: path.join("/repo", "packages", "cli", "dist", "index.js"),
      fileExists: () => false,
      resolveSpecifier: () => {
        throw new Error("not installed");
      },
    });

    expect(target).toBeNull();
  });

  it("registers todu tui and forwards arguments to the launcher", async () => {
    const program = new Command();
    const launch = vi.fn<(_: readonly string[]) => Promise<number>>().mockResolvedValue(0);

    program.name("todu");
    registerTuiCommand(program, launch);
    await program.parseAsync(["tui", "--", "--version"], { from: "user" });

    expect(launch).toHaveBeenCalledWith(["--version"]);
  });
});
