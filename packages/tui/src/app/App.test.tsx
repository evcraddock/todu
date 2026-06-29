import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("renders the initial TUI shell", () => {
    const { lastFrame } = render(<App />);

    expect(lastFrame()).toContain("todu TUI coming online");
    expect(lastFrame()).toContain("Press q or Ctrl+C to quit.");
  });
});
