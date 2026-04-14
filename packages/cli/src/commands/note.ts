import type { Note, NoteEntityType } from "@todu/core";
import type { Command } from "commander";
import { buildActorMap, formatActorDisplay, formatApprovalSummary } from "../actor-display.js";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON, formatTable } from "../format.js";

const NOTE_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "content", label: "Content" },
  { key: "author", label: "Author" },
  { key: "approval", label: "Approval" },
  { key: "entity", label: "Entity" },
  { key: "tags", label: "Tags" },
  { key: "createdAt", label: "Created" },
];

function noteToRow(
  n: Note,
  actorMap: Awaited<ReturnType<typeof buildActorMap>>,
): Record<string, string> {
  const entity = n.entityType ? `${n.entityType}:${n.entityId}` : "";
  const content = n.content.length > 60 ? `${n.content.slice(0, 57)}...` : n.content;
  return {
    id: n.id,
    content,
    author: formatActorDisplay(n.authorActorId, actorMap, n.author),
    approval: formatApprovalSummary(n.contentApproval) ?? "-",
    entity,
    tags: n.tags.join(", "),
    createdAt: n.createdAt,
  };
}

function noteDetail(n: Note, actorMap: Awaited<ReturnType<typeof buildActorMap>>): string {
  const lines = [
    `ID:      ${n.id}`,
    `Author:  ${formatActorDisplay(n.authorActorId, actorMap, n.author)}`,
    `Created: ${n.createdAt}`,
  ];
  if (n.entityType) lines.push(`Entity:  ${n.entityType}:${n.entityId}`);
  const approvalSummary = formatApprovalSummary(n.contentApproval);
  if (approvalSummary) lines.push(`Approval: ${approvalSummary}`);
  if (n.tags.length > 0) lines.push(`Tags:    ${n.tags.join(", ")}`);
  lines.push("", n.content);
  return lines.join("\n");
}

async function resolveProjectId(
  invokeDaemon: CliDaemonInvoker,
  ref: string,
): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
  const byId = await invokeDaemon<{ id: string }>("project.get", { id: ref });
  if (byId.ok) {
    return { ok: true, value: byId.value.id };
  }

  if (byId.error.code !== "NOT_FOUND") {
    return { ok: false, message: formatDaemonCommandError(byId.error) };
  }

  const list = await invokeDaemon<Array<{ id: string; name: string }>>("project.list", {});
  if (!list.ok) {
    return { ok: false, message: formatDaemonCommandError(list.error) };
  }

  const matches = list.value.filter((p) => p.name.toLowerCase() === ref.toLowerCase());
  if (matches.length === 1) {
    return { ok: true, value: matches[0].id };
  }

  if (matches.length > 1) {
    return { ok: false, message: `Multiple projects match "${ref}". Use the project ID instead.` };
  }

  return { ok: false, message: `Project not found: ${ref}` };
}

export function registerNoteCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
  const note = program.command("note").description("Manage notes and journal entries");

  note
    .command("add <content>")
    .description("Add a note (standalone journal entry, or attached to an entity)")
    .option("--task <id>", "attach to a task")
    .option("--project <ref>", "attach to a project")
    .option("--habit <id>", "attach to a habit")
    .option("--tag <tags...>", "tags")
    .option("--author <author>", "legacy author display name")
    .option("--author-actor <actorId>", "author actor ID")
    .option("--created-at <iso>", "ISO timestamp for importing/backdating a journal entry")
    .action(async (content, opts) => {
      if (opts.author && opts.authorActor) {
        console.error("Error: --author and --author-actor cannot be used together");
        process.exitCode = 1;
        return;
      }
      let entityType: NoteEntityType | undefined;
      let entityId: string | undefined;

      if (opts.task) {
        entityType = "task";
        entityId = opts.task;
      } else if (opts.project) {
        const project = await resolveProjectId(invokeDaemon, opts.project);
        if (!project.ok) {
          console.error(project.message);
          process.exitCode = 1;
          return;
        }

        entityType = "project";
        entityId = project.value;
      } else if (opts.habit) {
        entityType = "habit";
        entityId = opts.habit;
      }

      const result = await invokeDaemon<Note>("note.create", {
        input: {
          content,
          entityType,
          entityId,
          tags: opts.tag,
          author: opts.author,
          authorActorId: opts.authorActor,
          createdAt: opts.createdAt,
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
      } else {
        const actorMap = await buildActorMap(invokeDaemon);
        console.log("Note added:");
        console.log(noteDetail(result.value, actorMap));
      }
    });

  note
    .command("list")
    .description("List notes")
    .option("--task <id>", "filter by task")
    .option("--project <ref>", "filter by project")
    .option("--habit <id>", "filter by habit")
    .option("--tag <tag>", "filter by tag")
    .option("--author <author>", "filter by legacy author display name")
    .option("--author-actor <actorId>", "filter by author actor ID")
    .option("--journal", "filter to standalone journal entries only")
    .option("--from <date>", "filter by created-at start (YYYY-MM-DD or ISO-8601)")
    .option("--to <date>", "filter by created-at end (YYYY-MM-DD or ISO-8601)")
    .action(async (opts) => {
      if (opts.author && opts.authorActor) {
        console.error("Error: --author and --author-actor cannot be used together");
        process.exitCode = 1;
        return;
      }
      let entityType: NoteEntityType | undefined;
      let entityId: string | undefined;

      if (opts.task) {
        entityType = "task";
        entityId = opts.task;
      } else if (opts.project) {
        const project = await resolveProjectId(invokeDaemon, opts.project);
        if (!project.ok) {
          console.error(project.message);
          process.exitCode = 1;
          return;
        }

        entityType = "project";
        entityId = project.value;
      } else if (opts.habit) {
        entityType = "habit";
        entityId = opts.habit;
      }

      const result = await invokeDaemon<Note[]>("note.list", {
        filter: {
          entityType,
          entityId,
          tag: opts.tag,
          author: opts.author,
          authorActorId: opts.authorActor,
          journal: opts.journal,
          createdFrom: opts.from,
          createdTo: opts.to,
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
      } else if (result.value.length === 0) {
        console.log("No notes.");
      } else {
        const actorMap = await buildActorMap(invokeDaemon);
        console.log(
          formatTable(
            result.value.map((value) => noteToRow(value, actorMap)),
            NOTE_COLUMNS,
          ),
        );
      }
    });

  note
    .command("delete <id>")
    .description("Delete a note")
    .action(async (id) => {
      const result = await invokeDaemon<null>("note.delete", { id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON({ deleted: id }));
      } else {
        console.log(`Deleted note: ${id}`);
      }
    });
}
