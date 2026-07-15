import { Text } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { allProjectsFilter } from "../state/project-filter.js";
import { AppFrame, resolveTerminalSize } from "./AppFrame.js";

describe("AppFrame", () => {
  it("uses provided terminal dimensions", () => {
    expect(resolveTerminalSize({ width: 120, height: 40 })).toEqual({ width: 120, height: 40 });
  });

  it("falls back when terminal dimensions are unavailable", () => {
    expect(resolveTerminalSize({ width: undefined, height: undefined })).toEqual({
      width: 80,
      height: 24,
    });
    expect(resolveTerminalSize({ width: 0, height: -1 })).toEqual({ width: 80, height: 24 });
  });

  it("renders header, body, and footer in a fixed-height frame", () => {
    const { lastFrame } = render(
      <AppFrame
        route="tasks"
        taskFilter={{ projectFilter: allProjectsFilter }}
        footerContext="tasks-list"
        terminalWidth={60}
        terminalHeight={12}
      >
        <Text>body content</Text>
      </AppFrame>,
    );

    expect(lastFrame()).toContain("Tasks");
    expect(lastFrame()).toContain("Open · Any priority · All Projects");
    expect(lastFrame()).toContain("1 Tasks");
    expect(lastFrame()).toContain("2 Projects");
    expect(lastFrame()).toContain("3 Data Status");
    expect(lastFrame()).toContain("body content");
    expect(lastFrame()).toContain("↑↓ Select");
    expect(lastFrame()).toContain("← Projects");
    expect(lastFrame()).toContain("Enter Details");
  });
});
