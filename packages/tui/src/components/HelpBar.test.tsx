import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { HelpBar } from "./HelpBar.js";

describe("HelpBar", () => {
  it.each([
    ["tasks-list", ["↑↓ Select", "← Projects", "Enter Details", "c Comment", "? Help", "q Quit"]],
    ["tasks-projects", ["↑↓ Select", "→ Tasks", "Enter Focus", "? Help", "q Quit"]],
    ["task-detail", ["↑↓ Scroll", "Esc Back", "s Start", "d Done", "c Comment", "? Help"]],
    ["projects", ["↑↓ Select", "Enter Open Tasks", "a All Projects", "? Help", "q Quit"]],
    ["data-status", ["? Help", "q Quit"]],
    ["help", ["q Back"]],
    ["cancel-confirmation", ["y Confirm", "n/Esc Cancel"]],
    ["filter-modal", ["↑↓ Select", "Space Toggle", "←→ Priority", "Enter Apply"]],
  ] as const)("shows concise %s shortcuts", (context, expected) => {
    const { lastFrame } = render(<HelpBar context={context} />);

    for (const binding of expected) {
      expect(lastFrame()).toContain(binding);
    }
  });
});
