#!/usr/bin/env node

import { createTodu } from "@todu/engine";
import { Command } from "commander";
import { registerLabelCommands } from "./commands/label.js";
import { registerNoteCommands } from "./commands/note.js";
import { registerProjectCommands } from "./commands/project.js";
import { registerTaskCommands } from "./commands/task.js";
import { setColorEnabled } from "./format.js";

const program = new Command();

program
  .name("todu-new")
  .description("Local-first task management")
  .version("0.0.1")
  .option("--format <type>", "output format (text or json)", "text")
  .option("--no-color", "disable color output")
  .hook("preAction", () => {
    if (!program.opts().color) {
      setColorEnabled(false);
    }
  });

// Lazy initialization — only create Todu instance when a command runs
const getTodu = () => {
  const storagePath = process.env.TODU_DATA_DIR;
  return createTodu(storagePath ? { storagePath } : undefined);
};

// Register command groups
registerProjectCommands(program, getTodu);
registerTaskCommands(program, getTodu);
registerLabelCommands(program, getTodu);
registerNoteCommands(program, getTodu);

// Stubs for future vertical slices
program.command("recurring").description("Manage recurring templates (coming soon)");
program.command("habit").description("Manage habits (coming soon)");

program.parse();
