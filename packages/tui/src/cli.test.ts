import { describe, expect, it } from "vitest";
import { getHelpText, resolveCliMode } from "./cli.js";
import { VERSION } from "./version.js";

describe("resolveCliMode", () => {
  it("shows the version", () => {
    expect(resolveCliMode(["--version"])).toEqual({ kind: "version", output: VERSION });
  });

  it("shows help", () => {
    expect(resolveCliMode(["--help"])).toEqual({ kind: "help", output: getHelpText() });
  });

  it("launches the app by default", () => {
    expect(resolveCliMode([])).toEqual({ kind: "app" });
  });
});
