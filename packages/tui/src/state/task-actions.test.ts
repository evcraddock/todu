import { describe, expect, it } from "vitest";
import { resolveTaskStatusAction } from "./task-actions.js";

describe("task status actions", () => {
  it("maps keyboard shortcuts to status updates", () => {
    expect(resolveTaskStatusAction("s")).toMatchObject({
      status: "inprogress",
      requiresConfirmation: false,
    });
    expect(resolveTaskStatusAction("w")).toMatchObject({
      status: "waiting",
      requiresConfirmation: false,
    });
    expect(resolveTaskStatusAction("d")).toMatchObject({
      status: "done",
      requiresConfirmation: false,
    });
    expect(resolveTaskStatusAction("x")).toMatchObject({
      status: "canceled",
      requiresConfirmation: true,
    });
  });

  it("ignores unrelated keys", () => {
    expect(resolveTaskStatusAction("?")).toBeNull();
  });
});
