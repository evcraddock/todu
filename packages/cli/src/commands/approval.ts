import type { ApprovalItem, ApprovalItemKind, Project } from "@todu/core";
import type { Command } from "commander";
import { buildActorMap, formatActorDisplay } from "../actor-display.js";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON, formatTable } from "../format.js";

const APPROVAL_COLUMNS = [
  { key: "kind", label: "Kind" },
  { key: "target", label: "Target" },
  { key: "scope", label: "Scope" },
  { key: "source", label: "Source" },
  { key: "preview", label: "Preview" },
];

function parseApprovalKind(value: string): ApprovalItemKind | null {
  switch (value) {
    case "task":
      return "taskDescription";
    case "note":
      return "noteContent";
    default:
      return null;
  }
}

async function buildProjectNameMap(
  invokeDaemon: CliDaemonInvoker,
): Promise<Record<string, string>> {
  const result = await invokeDaemon<Project[]>("project.list", {});
  if (!result.ok) {
    return {};
  }

  return Object.fromEntries(result.value.map((project) => [project.id, project.name]));
}

function formatApprovalKind(kind: ApprovalItemKind): string {
  return kind === "taskDescription" ? "task description" : "note content";
}

function approvalToRow(
  approval: ApprovalItem,
  projectNameMap: Record<string, string>,
  actorMap: Awaited<ReturnType<typeof buildActorMap>>,
): Record<string, string> {
  return {
    kind: formatApprovalKind(approval.kind),
    target: approval.taskId ?? approval.noteId ?? "-",
    scope:
      approval.kind === "taskDescription"
        ? (projectNameMap[approval.projectId ?? ""] ?? approval.projectId ?? "-")
        : approval.entityType && approval.entityId
          ? `${approval.entityType}:${approval.entityId}`
          : "journal",
    source: approval.sourceActorId
      ? formatActorDisplay(approval.sourceActorId, actorMap)
      : (approval.sourceBindingId ?? "-"),
    preview: approval.contentPreview,
  };
}

function approvalDetail(
  approval: ApprovalItem,
  projectNameMap: Record<string, string>,
  actorMap: Awaited<ReturnType<typeof buildActorMap>>,
): string {
  const lines = [
    `Kind:        ${formatApprovalKind(approval.kind)}`,
    `State:       ${approval.state}`,
    `Target:      ${approval.taskId ?? approval.noteId ?? "-"}`,
  ];

  if (approval.kind === "taskDescription") {
    lines.push(`Task:        ${approval.taskTitle ?? approval.taskId ?? "-"}`);
    lines.push(
      `Project:     ${projectNameMap[approval.projectId ?? ""] ?? approval.projectId ?? "-"}`,
    );
  } else {
    lines.push(
      `Entity:      ${approval.entityType && approval.entityId ? `${approval.entityType}:${approval.entityId}` : "journal"}`,
    );
  }

  if (approval.sourceBindingId) {
    lines.push(`Binding:     ${approval.sourceBindingId}`);
  }
  if (approval.sourceActorId) {
    lines.push(`Source:      ${formatActorDisplay(approval.sourceActorId, actorMap)}`);
  }
  if (approval.reviewedAt) {
    lines.push(`Reviewed:    ${approval.reviewedAt}`);
  }
  if (approval.reviewedByActorId) {
    lines.push(`Reviewed by: ${formatActorDisplay(approval.reviewedByActorId, actorMap)}`);
  }
  lines.push(`Preview:     ${approval.contentPreview}`);

  return lines.join("\n");
}

export function registerApprovalCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
  const approval = program.command("approval").description("Manage imported content approvals");

  approval
    .command("list")
    .description("List content currently pending approval")
    .option("--kind <kind>", "filter by kind (task or note)")
    .action(async (opts) => {
      let kind: ApprovalItemKind | undefined;
      if (opts.kind) {
        const parsedKind = parseApprovalKind(opts.kind);
        if (!parsedKind) {
          console.error(`Error: invalid approval kind: ${opts.kind}`);
          process.exitCode = 1;
          return;
        }
        kind = parsedKind;
      }

      const result = await invokeDaemon<ApprovalItem[]>("approval.list", {
        filter: {
          kind,
        },
      });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
        return;
      }

      const [projectNameMap, actorMap] = await Promise.all([
        buildProjectNameMap(invokeDaemon),
        buildActorMap(invokeDaemon),
      ]);
      console.log(
        formatTable(
          result.value.map((item) => approvalToRow(item, projectNameMap, actorMap)),
          APPROVAL_COLUMNS,
        ),
      );
    });

  const approve = approval.command("approve").description("Approve imported content explicitly");

  approve
    .command("task-description <taskId>")
    .description("Approve imported task description content")
    .action(async (taskId) => {
      const result = await invokeDaemon<ApprovalItem>("approval.approveTaskDescription", {
        taskId,
      });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
        return;
      }

      const [projectNameMap, actorMap] = await Promise.all([
        buildProjectNameMap(invokeDaemon),
        buildActorMap(invokeDaemon),
      ]);
      console.log("Approval updated:");
      console.log(approvalDetail(result.value, projectNameMap, actorMap));
    });

  approve
    .command("note-content <noteId>")
    .description("Approve imported note or comment content")
    .action(async (noteId) => {
      const result = await invokeDaemon<ApprovalItem>("approval.approveNoteContent", {
        noteId,
      });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
        return;
      }

      const [projectNameMap, actorMap] = await Promise.all([
        buildProjectNameMap(invokeDaemon),
        buildActorMap(invokeDaemon),
      ]);
      console.log("Approval updated:");
      console.log(approvalDetail(result.value, projectNameMap, actorMap));
    });
}
