import type { Label, LabelId } from "@todu/core";
import { createLabelId } from "@todu/core";
import type { Todu } from "@todu/engine";
import type { Command } from "commander";
import { formatError, formatJSON, formatTable } from "../format.js";

const LABEL_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "color", label: "Color" },
];

function labelToRow(l: Label): Record<string, string> {
  return {
    id: l.id,
    name: l.name,
    color: l.color ?? "",
  };
}

function labelDetail(l: Label): string {
  const lines = [`ID:      ${l.id}`, `Name:    ${l.name}`, `Created: ${l.createdAt}`];
  if (l.color) lines.splice(2, 0, `Color:   ${l.color}`);
  return lines.join("\n");
}

async function resolveLabel(
  todu: Todu,
  ref: string,
): Promise<{ ok: true; value: Label } | { ok: false; message: string }> {
  // Try as ID
  const list = await todu.label.list();
  if (!list.ok) return { ok: false, message: formatError(list.error) };

  const byId = list.value.find((l) => l.id === ref);
  if (byId) return { ok: true, value: byId };

  const byName = list.value.filter((l) => l.name.toLowerCase() === ref.toLowerCase());
  if (byName.length === 1) return { ok: true, value: byName[0] };
  if (byName.length > 1) {
    return { ok: false, message: `Multiple labels match "${ref}". Use the label ID instead.` };
  }

  return { ok: false, message: `Label not found: ${ref}` };
}

export function registerLabelCommands(program: Command, getTodu: () => Promise<Todu>): void {
  const label = program.command("label").description("Manage labels");

  label
    .command("create")
    .description("Create a new label")
    .requiredOption("--name <name>", "label name")
    .option("--color <color>", "hex color (#RRGGBB)")
    .action(async (opts) => {
      const todu = await getTodu();
      try {
        const result = await todu.label.create({ name: opts.name, color: opts.color });
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }
        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log("Label created:");
          console.log(labelDetail(result.value));
        }
      } finally {
        await todu.close();
      }
    });

  label
    .command("list")
    .description("List all labels")
    .action(async () => {
      const todu = await getTodu();
      try {
        const result = await todu.label.list();
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }
        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON(result.value));
        } else {
          console.log(formatTable(result.value.map(labelToRow), LABEL_COLUMNS));
        }
      } finally {
        await todu.close();
      }
    });

  label
    .command("update <ref>")
    .description("Update a label (by ID or name)")
    .option("--name <name>", "new name")
    .option("--color <color>", "new hex color")
    .action(async (ref, opts) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveLabel(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }
        const result = await todu.label.update(resolved.value.id, {
          name: opts.name,
          color: opts.color,
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
          console.log("Label updated:");
          console.log(labelDetail(result.value));
        }
      } finally {
        await todu.close();
      }
    });

  label
    .command("delete <ref>")
    .description("Delete a label (by ID or name)")
    .action(async (ref) => {
      const todu = await getTodu();
      try {
        const resolved = await resolveLabel(todu, ref);
        if (!resolved.ok) {
          console.error(resolved.message);
          process.exitCode = 1;
          return;
        }
        const result = await todu.label.delete(resolved.value.id);
        if (!result.ok) {
          console.error(formatError(result.error));
          process.exitCode = 1;
          return;
        }
        const format = program.opts().format;
        if (format === "json") {
          console.log(formatJSON({ deleted: resolved.value.id }));
        } else {
          console.log(`Deleted label: ${resolved.value.name} (${resolved.value.id})`);
        }
      } finally {
        await todu.close();
      }
    });
}
