import type { Actor } from "@todu/core";
import type { Command } from "commander";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON, formatTable } from "../format.js";

const ACTOR_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "state", label: "State" },
];

function normalizeActorForOutput(actor: Actor): Actor & { archived: boolean } {
  return {
    ...actor,
    archived: actor.archived ?? false,
  };
}

function actorToRow(actor: Actor): Record<string, string> {
  return {
    id: actor.id,
    name: actor.displayName,
    state: actor.archived ? "archived" : "active",
  };
}

function actorDetail(actor: Actor): string {
  return [
    `ID:          ${actor.id}`,
    `Name:        ${actor.displayName}`,
    `Archived:    ${actor.archived ? "yes" : "no"}`,
  ].join("\n");
}

function printActor(program: Command, actor: Actor, heading?: string): void {
  const output = normalizeActorForOutput(actor);
  const format = program.opts().format;
  if (format === "json") {
    console.log(formatJSON(output));
    return;
  }

  if (heading) {
    console.log(heading);
  }
  console.log(actorDetail(output));
}

export function registerActorCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
  const actor = program.command("actor").description("Manage actors");

  actor
    .command("list")
    .description("List actors")
    .action(async () => {
      const result = await invokeDaemon<Actor[]>("actor.list", {});
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const actors = result.value.map(normalizeActorForOutput);
      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(actors));
      } else {
        console.log(formatTable(actors.map(actorToRow), ACTOR_COLUMNS));
      }
    });

  actor
    .command("create")
    .description("Create an actor")
    .requiredOption("--id <actorId>", "actor ID")
    .requiredOption("--name <displayName>", "display name")
    .action(async (opts) => {
      const result = await invokeDaemon<Actor>("actor.create", {
        input: {
          id: opts.id,
          displayName: opts.name,
        },
      });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      printActor(program, result.value, "Actor created:");
    });

  const owner = actor
    .command("owner")
    .description(
      "Inspect or change the catalog owner actor with special fallback/default semantics",
    );

  owner
    .command("show")
    .description("Show the current owner actor")
    .action(async () => {
      const result = await invokeDaemon<Actor>("actor.getOwner", {});
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      printActor(program, result.value, "Owner actor:");
    });

  owner
    .command("set <actorId>")
    .description("Set the current owner actor to an existing non-archived actor")
    .action(async (actorId) => {
      const result = await invokeDaemon<Actor>("actor.setOwner", { actorId });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      printActor(program, result.value, "Owner actor updated:");
    });

  actor
    .command("rename <id>")
    .description("Rename an actor display name")
    .requiredOption("--name <displayName>", "display name")
    .action(async (id, opts) => {
      const result = await invokeDaemon<Actor>("actor.rename", {
        id,
        displayName: opts.name,
      });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      printActor(program, result.value, "Actor renamed:");
    });

  actor
    .command("archive <id>")
    .description("Archive an actor")
    .action(async (id) => {
      const result = await invokeDaemon<Actor>("actor.archive", { id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      printActor(program, result.value, "Actor archived:");
    });

  actor
    .command("unarchive <id>")
    .description("Unarchive an actor")
    .action(async (id) => {
      const result = await invokeDaemon<Actor>("actor.unarchive", { id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      printActor(program, result.value, "Actor unarchived:");
    });
}
