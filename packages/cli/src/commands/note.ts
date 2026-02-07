import type { Note, NoteEntityType } from "@todu/core";
import { createNoteId, createProjectId } from "@todu/core";
import type { Todu } from "@todu/engine";
import type { Command } from "commander";
import { formatError, formatJSON, formatTable } from "../format.js";

const NOTE_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "content", label: "Content" },
  { key: "author", label: "Author" },
  { key: "entity", label: "Entity" },
  { key: "tags", label: "Tags" },
  { key: "createdAt", label: "Created" },
];

function noteToRow(n: Note): Record<string, string> {
  const entity = n.entityType ? `${n.entityType}:${n.entityId}` : "";
  const content = n.content.length > 60 ? `${n.content.slice(0, 57)}...` : n.content;
  return {
    id: n.id,
    content,
    author: n.author,
    entity,
    tags: n.tags.join(", "),
    createdAt: n.createdAt,
  };
}

function noteDetail(n: Note): string {
  const lines = [`ID:      ${n.id}`, `Author:  ${n.author}`, `Created: ${n.createdAt}`];
  if (n.entityType) lines.push(`Entity:  ${n.entityType}:${n.entityId}`);
  if (n.tags.length > 0) lines.push(`Tags:    ${n.tags.join(", ")}`);
  lines.push("", n.content);
  return lines.join("\n");
}

export function registerNoteCommands(program: Command, getTodu: () => Promise<Todu>): void {
  const note = program.command("note").description("Manage notes and journal entries");

  note
    .command("add <content>")
    .description("Add a note (standalone journal entry, or attached to an entity)")
    .option("--task <id>", "attach to a task")
    .option("--project <ref>", "attach to a project")
    .option("--tag <tags...>", "tags")
    .option("--author <author>", "author (default: user)")
    .action(async (content, opts) => {
      const todu = await getTodu();
      try {
        let entityType: NoteEntityType | undefined;
        let entityId: string | undefined;

        if (opts.task) {
          entityType = "task";
          entityId = opts.task;
        } else if (opts.project) {
          // Resolve project by name or ID
          const projResult = await todu.project.get(createProjectId(opts.project));
          if (projResult.ok) {
            entityType = "project";
            entityId = projResult.value.id;
          } else {
            const list = await todu.project.list();
            if (list.ok) {
              const match = list.value.find(
                (p) => p.name.toLowerCase() === opts.project.toLowerCase(),
              );
              if (match) {
                entityType = "project";
                entityId = match.id;
              } else {
                console.error(`Project not found: ${opts.project}`);
                process.exitCode = 1;
                return;
              }
            }
          }
        }

        const result = await todu.note.create({
          content,
          entityType,
          entityId,
          tags: opts.tag,
          author: opts.author,
        });

        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log("Note added:");
          console.log(noteDetail(result.value));
        }
      } finally {
        await todu.close();
      }
    });

  note
    .command("list")
    .description("List notes")
    .option("--task <id>", "filter by task")
    .option("--project <ref>", "filter by project")
    .option("--tag <tag>", "filter by tag")
    .option("--author <author>", "filter by author")
    .action(async (opts) => {
      const todu = await getTodu();
      try {
        let entityType: NoteEntityType | undefined;
        let entityId: string | undefined;

        if (opts.task) {
          entityType = "task";
          entityId = opts.task;
        } else if (opts.project) {
          // Resolve project
          const projResult = await todu.project.get(createProjectId(opts.project));
          if (projResult.ok) {
            entityType = "project";
            entityId = projResult.value.id;
          } else {
            const list = await todu.project.list();
            if (list.ok) {
              const match = list.value.find(
                (p) => p.name.toLowerCase() === opts.project.toLowerCase(),
              );
              if (match) {
                entityType = "project";
                entityId = match.id;
              } else {
                console.error(`Project not found: ${opts.project}`);
                process.exitCode = 1;
                return;
              }
            }
          }
        }

        const result = await todu.note.list({
          entityType,
          entityId,
          tag: opts.tag,
          author: opts.author,
        });

        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }

        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          if (result.value.length === 0) {
            console.log("No notes.");
          } else {
            console.log(formatTable(result.value.map(noteToRow), NOTE_COLUMNS));
          }
        }
      } finally {
        await todu.close();
      }
    });

  note
    .command("delete <id>")
    .description("Delete a note")
    .action(async (id) => {
      const todu = await getTodu();
      try {
        const result = await todu.note.delete(createNoteId(id));
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }
        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON({ deleted: id }));
        } else {
          console.log(`Deleted note: ${id}`);
        }
      } finally {
        await todu.close();
      }
    });
}
