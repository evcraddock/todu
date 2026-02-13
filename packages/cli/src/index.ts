#!/usr/bin/env node

import { createTodu, isSyncServerAvailable } from "@todu/engine";
import { Command } from "commander";
import { registerConfigCommands } from "./commands/config.js";
import { registerHabitCommands } from "./commands/habit.js";
import { registerLabelCommands } from "./commands/label.js";
import { registerNoteCommands } from "./commands/note.js";
import { registerProjectCommands } from "./commands/project.js";
import { registerRecurringCommands } from "./commands/recurring.js";
import { registerSyncCommands } from "./commands/sync.js";
import { registerTaskCommands } from "./commands/task.js";
import { getConfigPath, loadConfig, resolveDataDir } from "./config.js";
import { setColorEnabled } from "./format.js";

const program = new Command();

program
  .name("toduai")
  .description("Local-first task management")
  .version("0.0.1")
  .option("--format <type>", "output format (text or json)", "text")
  .option("--config <path>", "path to config file")
  .option("--no-color", "disable color output")
  .hook("preAction", () => {
    if (!program.opts().color) {
      setColorEnabled(false);
    }
  });

// Lazy initialization — resolve config, then create Todu instance.
// Tries to connect to a running sync server (Electron) first so
// both share the same Automerge data in real-time.
const getTodu = async () => {
  const opts = program.opts();
  const configPath = getConfigPath(opts.config);
  const config = loadConfig(configPath);
  const storagePath = resolveDataDir(configPath, config);
  const syncClient = await isSyncServerAvailable();
  return createTodu({ storagePath, syncClient });
};

// Register command groups
registerProjectCommands(program, getTodu);
registerTaskCommands(program, getTodu);
registerLabelCommands(program, getTodu);
registerNoteCommands(program, getTodu);
registerRecurringCommands(program, getTodu);
registerHabitCommands(program, getTodu);
registerSyncCommands(program, getTodu);
registerConfigCommands(program);

program.parse();
