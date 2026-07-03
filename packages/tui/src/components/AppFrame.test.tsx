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
        connection={{
          state: "connected",
          socketPath: "/tmp/todu.sock",
          hello: {
            protocolVersion: 1,
            daemonVersion: "dev",
            pid: 123,
            capabilities: [],
          },
          error: null,
          reconnectAttempt: 0,
          reconnectDelayMs: null,
        }}
        projectFilter={allProjectsFilter}
        terminalWidth={60}
        terminalHeight={12}
      >
        <Text>body content</Text>
      </AppFrame>,
    );

    expect(lastFrame()).toContain("Todu • Tasks");
    expect(lastFrame()).toContain("View: Tasks");
    expect(lastFrame()).toContain("body content");
    expect(lastFrame()).toContain("1 Tasks");
  });
});
