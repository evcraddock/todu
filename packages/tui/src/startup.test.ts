import { describe, expect, it, vi } from "vitest";
import { startTui } from "./startup.js";

function createOutput(isTTY = true) {
  return { isTTY, write: vi.fn().mockReturnValue(true) };
}

describe("TUI startup", () => {
  it("shows startup feedback before loading the UI and clears it when rendering", async () => {
    const output = createOutput();
    const render = vi.fn();
    let finishLoading!: (render: () => void) => void;
    const load = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          finishLoading = resolve;
        }),
    );

    const starting = startTui({ output, errorOutput: output, load });
    expect(output.write).toHaveBeenCalledWith("Starting Todu TUI…\n");
    expect(render).not.toHaveBeenCalled();

    finishLoading(render);
    expect(await starting).toBe(true);
    expect(output.write).toHaveBeenLastCalledWith("\u001b[1A\u001b[2K");
    expect(render).toHaveBeenCalledOnce();
  });

  it("reports initialization failure rather than leaving a startup message", async () => {
    const output = createOutput();
    const load = vi.fn().mockRejectedValue(new Error("Fixture import failure"));

    expect(await startTui({ output, errorOutput: output, load })).toBe(false);
    expect(output.write).toHaveBeenLastCalledWith(
      "Todu TUI startup failed: Fixture import failure\n",
    );
  });

  it("reports a synchronous render failure", async () => {
    const output = createOutput();
    const load = async () => () => {
      throw new Error("Fixture render failure");
    };

    expect(await startTui({ output, errorOutput: output, load })).toBe(false);
    expect(output.write).toHaveBeenLastCalledWith(
      "Todu TUI startup failed: Fixture render failure\n",
    );
  });

  it("does not write terminal startup feedback or cursor controls to redirected output", async () => {
    const output = createOutput(false);
    const render = vi.fn();

    expect(await startTui({ output, load: async () => render })).toBe(true);
    expect(output.write).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledOnce();
  });
});
