import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { ListFilterModal } from "./ListFilterModal.js";

const statuses = [
  { value: "active", label: "Active" },
  { value: "done", label: "Done" },
] as const;

async function flushInput(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe("ListFilterModal", () => {
  it("toggles statuses, changes priority, and applies the draft", async () => {
    const onApply = vi.fn();
    const { stdin, lastFrame } = render(
      <ListFilterModal
        title="Filter tasks"
        statusOptions={statuses}
        initialFilter={{ statuses: ["active"] }}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );

    expect(lastFrame()).toContain("[x] Active");
    stdin.write("j");
    await flushInput();
    stdin.write(" ");
    await flushInput();
    stdin.write("j");
    await flushInput();
    stdin.write("\u001B[C");
    await flushInput();
    stdin.write("\r");

    expect(onApply).toHaveBeenCalledWith({ statuses: ["active", "done"], priority: "high" });
  });
});
