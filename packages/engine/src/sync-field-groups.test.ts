import { createIntegrationBindingId, createTaskId, type SyncTaskFieldGroupInput } from "@todu/core";
import { describe, expect, it } from "vitest";
import { reconcileSyncTaskFieldGroup, syncTaskFieldGroupValuesEqual } from "./sync-field-groups.js";

const context = {
  bindingId: createIntegrationBindingId("binding-1"),
  localTaskId: createTaskId("task-1"),
  externalId: "remote-1",
};
const older = "2026-04-01T00:00:00Z";
const newer = "2026-04-02T00:00:00Z";
const base = { title: "Base", description: "Body" };
const localEdit = { title: "Local", description: "Body" };
const remoteEdit = { title: "Remote", description: "Body" };

describe("three-way task field-group reconciliation", () => {
  it.each([
    [base, base, "unchanged", "equal", false],
    [localEdit, base, "local-only", "local", true],
    [base, remoteEdit, "remote-only", "remote", false],
    [remoteEdit, remoteEdit, "converged", "equal", false],
  ] as const)("resolves %s / %s without using clocks", (local, remote, resolution, winner, remoteWriteRequired) => {
    const result = reconcileSyncTaskFieldGroup({
      ...context,
      group: "content",
      local,
      input: { base, remote, sourceTimestamp: older },
      localTimestamp: newer,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        resolution,
        winner,
        remoteWriteRequired,
        value: winner === "remote" ? remote : local,
      },
    });
    expect(result.ok && "conflict" in result.value).toBe(false);
  });

  it.each([
    [newer, older, "local", "newer-timestamp"],
    [older, newer, "remote", "newer-timestamp"],
    [newer, newer, "remote", "remote-wins-equal-timestamps"],
    ["2026-04-01T01:00:00+01:00", older, "remote", "remote-wins-equal-timestamps"],
    [undefined, older, "remote", "remote-wins-missing-timestamp"],
    [newer, undefined, "remote", "remote-wins-missing-timestamp"],
    [undefined, undefined, "remote", "remote-wins-missing-timestamp"],
  ] as const)("resolves divergent edits with local=%s remote=%s", (localTimestamp, sourceTimestamp, winner, selection) => {
    const input: SyncTaskFieldGroupInput<"content"> = {
      base,
      remote: remoteEdit,
      ...(sourceTimestamp ? { sourceTimestamp } : {}),
    };
    const result = reconcileSyncTaskFieldGroup({
      ...context,
      group: "content",
      local: localEdit,
      input,
      ...(localTimestamp ? { localTimestamp } : {}),
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        resolution: "conflict",
        winner,
        remoteWriteRequired: winner === "local",
        value: winner === "local" ? localEdit : remoteEdit,
        conflict: {
          ...context,
          group: "content",
          selection,
          ...(localTimestamp ? { localTimestamp } : {}),
          ...(sourceTimestamp ? { remoteTimestamp: sourceTimestamp } : {}),
        },
      },
    });
  });

  it.each([
    "local",
    "remote",
  ])("rejects an invalid supplied %s clock even for one-sided changes", (side) => {
    const result = reconcileSyncTaskFieldGroup({
      ...context,
      group: "content",
      local: base,
      input: { base, remote: remoteEdit, sourceTimestamp: side === "remote" ? "invalid" : newer },
      localTimestamp: side === "local" ? "invalid" : older,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { type: "validation", field: side === "local" ? "localTimestamp" : "sourceTimestamp" },
    });
  });

  it("rejects parseable but non-RFC source timestamps and malformed normalized input", () => {
    for (const input of [
      { base, remote: remoteEdit, sourceTimestamp: "2026" },
      { base, remote: { title: "Remote" } },
    ]) {
      expect(
        reconcileSyncTaskFieldGroup({
          ...context,
          group: "content",
          local: base,
          input: input as SyncTaskFieldGroupInput<"content">,
        }),
      ).toMatchObject({ ok: false, error: { type: "validation" } });
    }
  });

  it("compares label and assignee sets without ordering or duplicate sensitivity", () => {
    expect(
      syncTaskFieldGroupValuesEqual({
        group: "classification",
        left: { priority: "high", labels: ["a", "b", "a"] },
        right: { priority: "high", labels: ["b", "a"] },
      }),
    ).toBe(true);
    expect(
      syncTaskFieldGroupValuesEqual({
        group: "classification",
        left: { priority: "low", labels: ["a"] },
        right: { priority: "high", labels: ["a"] },
      }),
    ).toBe(false);
    expect(
      syncTaskFieldGroupValuesEqual({
        group: "assignment",
        left: {
          assignees: [{ externalAccountId: "42", externalLogin: "old" }, { externalLogin: "ERIK" }],
        },
        right: {
          assignees: [{ externalLogin: "erik" }, { externalAccountId: "42", externalLogin: "new" }],
        },
      }),
    ).toBe(true);
    expect(
      syncTaskFieldGroupValuesEqual({
        group: "assignment",
        left: { assignees: [{ externalAccountId: "42" }] },
        right: { assignees: [{ externalAccountId: "43" }] },
      }),
    ).toBe(false);
    expect(
      syncTaskFieldGroupValuesEqual({
        group: "workflow",
        left: { status: "active" },
        right: { status: "done" },
      }),
    ).toBe(false);
  });
});
