import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type SyncProviderPullAcknowledgmentV5,
  type SyncTaskFieldGroupInput,
  type SyncTaskFieldGroupOutcome,
  type SyncTaskFieldGroupUpdate,
  validateSyncTaskFieldGroupUpdate,
} from "./sync-field-groups.js";
import type { SyncProviderV4, SyncProviderV5 } from "./sync-provider.js";
import { createIntegrationBindingId, createProjectId, createTaskId } from "./types.js";

const timestamp = "2026-06-01T12:00:00Z";

function update(): SyncTaskFieldGroupUpdate {
  return {
    externalId: "provider/project/123",
    localTaskId: createTaskId("task-123"),
    groups: {
      content: {
        base: { title: "Original", description: "Body" },
        remote: { title: "Renamed", description: "" },
        sourceTimestamp: timestamp,
      },
      workflow: { base: { status: "active" }, remote: { status: "done" } },
      classification: {
        base: { priority: "medium", labels: ["old"] },
        remote: { priority: "high", labels: [] },
      },
      assignment: {
        base: { assignees: [{ externalAccountId: "42" }] },
        remote: { assignees: [] },
      },
    },
  };
}

describe("field-group update validation", () => {
  it("accepts all independent groups, explicit clearing, and an existing task identity", () => {
    const input = update();
    expect(validateSyncTaskFieldGroupUpdate(input)).toEqual({ ok: true, value: input });
  });

  it("accepts omitted groups without filling defaults", () => {
    const input = { externalId: "123", groups: { workflow: update().groups.workflow } };
    expect(validateSyncTaskFieldGroupUpdate(input)).toEqual({ ok: true, value: input });
    expect(Object.keys(input.groups)).toEqual(["workflow"]);
  });

  it("allows a missing timestamp but requires a real mirrored base", () => {
    const input = update();
    expect(validateSyncTaskFieldGroupUpdate(input).ok).toBe(true);
    expect(
      validateSyncTaskFieldGroupUpdate({
        ...input,
        groups: { content: { remote: { title: "Title", description: "" } } },
      }),
    ).toMatchObject({ ok: false, error: { field: "groups.content.base" } });
  });

  it.each([
    [null, "update"],
    [[], "update"],
    [{ externalId: "", groups: {} }, "externalId"],
    [{ externalId: "123", localTaskId: "", groups: {} }, "localTaskId"],
    [{ externalId: "123", groups: {} }, "groups"],
    [{ externalId: "123", groups: { comments: {} } }, "groups.comments"],
    [{ externalId: "123", groups: { content: undefined } }, "groups.content"],
    [{ externalId: "123", groups: { workflow: null } }, "groups.workflow"],
  ])("rejects malformed identity or groups (%s)", (input, field) => {
    expect(validateSyncTaskFieldGroupUpdate(input)).toMatchObject({ ok: false, error: { field } });
  });

  it.each([
    "base",
    "remote",
  ])("rejects partial or invalid %s values rather than clearing omitted fields", (side) => {
    for (const [group, value] of [
      ["content", { title: "Title" }],
      ["content", { title: "", description: "" }],
      ["workflow", { status: "closed" }],
      ["classification", { priority: "urgent", labels: [] }],
      ["classification", { priority: "high", labels: [1] }],
      ["assignment", { assignees: [{}] }],
      ["assignment", { assignees: [{ externalAccountId: " " }] }],
    ] as const) {
      const valid = update().groups[group];
      const input = { externalId: "123", groups: { [group]: { ...valid, [side]: value } } };
      expect(validateSyncTaskFieldGroupUpdate(input)).toMatchObject({
        ok: false,
        error: { field: `groups.${group}.${side}` },
      });
    }
  });

  it.each([
    "yesterday",
    "2026",
    "2026-06-01T12:00:00",
    "2026-02-30T12:00:00Z",
    "2026-06-01T24:00:00Z",
    null,
    42,
  ])("rejects invalid source timestamps (%s)", (sourceTimestamp) => {
    const input = update();
    expect(
      validateSyncTaskFieldGroupUpdate({
        ...input,
        groups: { content: { ...input.groups.content, sourceTimestamp } },
      }),
    ).toMatchObject({ ok: false, error: { field: "groups.content.sourceTimestamp" } });
  });

  it("accepts timezone offsets and stable external login identities", () => {
    expect(
      validateSyncTaskFieldGroupUpdate({
        externalId: "123",
        groups: {
          assignment: {
            base: { assignees: [] },
            remote: { assignees: [{ externalLogin: "erik" }] },
            sourceTimestamp: "2026-06-01T14:00:00+02:00",
          },
        },
      }).ok,
    ).toBe(true);
  });
});

describe("field-group acknowledgment contract", () => {
  it("carries winning values and diagnostics separately from the opaque checkpoint", async () => {
    const bindingId = createIntegrationBindingId("binding-123");
    const localTaskId = createTaskId("task-123");
    const acknowledgment: SyncProviderPullAcknowledgmentV5 = {
      taskResults: [
        {
          externalId: "123",
          localTaskId,
          groups: {
            content: {
              value: { title: "Local title", description: "Body" },
              resolution: "local-only",
              winner: "local",
              remoteWriteRequired: true,
            },
            workflow: {
              value: { status: "done" },
              resolution: "conflict",
              winner: "remote",
              remoteWriteRequired: false,
              conflict: {
                bindingId,
                localTaskId,
                externalId: "123",
                group: "workflow",
                localTimestamp: timestamp,
                remoteTimestamp: timestamp,
                selection: "remote-wins-equal-timestamps",
              },
            },
            classification: {
              value: { priority: "high", labels: [] },
              resolution: "converged",
              winner: "equal",
              remoteWriteRequired: false,
            },
          },
          deferred: { assignment: "incomplete-assignment-mapping" },
        },
      ],
    };
    const checkpoint = { cursor: "opaque" };
    const received: unknown[] = [];
    const acknowledge: SyncProviderV5["acknowledgePull"] = async (
      _binding,
      progress,
      _project,
      results,
    ) => {
      received.push(progress, results);
    };
    const project = {
      id: createProjectId("project-123"),
      name: "Test",
      status: "active" as const,
      priority: "medium" as const,
      authorizedAssigneeActorIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await acknowledge(
      {
        id: bindingId,
        projectId: project.id,
        provider: "test",
        targetKind: "project",
        targetRef: "test",
        strategy: "bidirectional",
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      checkpoint,
      project,
      acknowledgment,
    );
    expect(received[0]).toBe(checkpoint);
    expect(received[1]).toBe(acknowledgment);
    expect(acknowledgment.taskResults[0].groups.content?.remoteWriteRequired).toBe(true);
    expect(acknowledgment.taskResults[0].groups.assignment).toBeUndefined();
  });
});

describe("field-group types", () => {
  it("compiles the contract type assertions with the project compiler", () => {
    const compiler = fileURLToPath(
      new URL("../../../node_modules/@typescript/native-preview/bin/tsgo.js", import.meta.url),
    );
    execFileSync(
      process.execPath,
      [
        compiler,
        "--ignoreConfig",
        "--noEmit",
        "--strict",
        "--module",
        "Node16",
        "--target",
        "ES2022",
        "--skipLibCheck",
        fileURLToPath(import.meta.url),
      ],
      { encoding: "utf8" },
    );
  }, 15000);

  it("requires complete base values and prevents local-wins ties or missing conflict diagnostics", () => {
    type ContentOutcome = SyncTaskFieldGroupOutcome<"content">;
    type LocalConflict = Extract<ContentOutcome, { resolution: "conflict"; winner: "local" }>;
    expectTypeOf<LocalConflict["conflict"]["selection"]>().toEqualTypeOf<"newer-timestamp">();
    expectTypeOf<
      Extract<ContentOutcome, { resolution: "local-only" }>["remoteWriteRequired"]
    >().toEqualTypeOf<true>();
    expectTypeOf<
      Extract<ContentOutcome, { resolution: "remote-only" }>["remoteWriteRequired"]
    >().toEqualTypeOf<false>();
    expectTypeOf<
      Extract<ContentOutcome, { resolution: "unchanged" | "converged" }>["winner"]
    >().toEqualTypeOf<"equal">();
    expectTypeOf<{ remote: { title: string; description: string } }>().not.toExtend<
      SyncTaskFieldGroupInput<"content">
    >();
    expectTypeOf<{
      value: { title: string; description: string };
      resolution: "conflict";
      winner: "remote";
      remoteWriteRequired: false;
    }>().not.toExtend<ContentOutcome>();
  });

  it("keeps group values distinct and local task identities branded", () => {
    expectTypeOf<SyncProviderV5>().not.toExtend<SyncProviderV4>();
    expectTypeOf<NonNullable<SyncTaskFieldGroupUpdate["localTaskId"]>>().toEqualTypeOf<
      ReturnType<typeof createTaskId>
    >();
    expectTypeOf<SyncTaskFieldGroupOutcome<"content">["value"]>().toEqualTypeOf<{
      title: string;
      description: string;
    }>();
    expectTypeOf<SyncTaskFieldGroupOutcome<"workflow">["value"]>().not.toEqualTypeOf<
      SyncTaskFieldGroupOutcome<"assignment">["value"]
    >();
  });
});
