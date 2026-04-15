#!/usr/bin/env node

import { Command } from "commander";
import { registerActorCommands } from "./commands/actor.js";
import { registerApprovalCommands } from "./commands/approval.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerDaemonCommands } from "./commands/daemon.js";
import { registerHabitCommands } from "./commands/habit.js";
import { registerIntegrationCommands } from "./commands/integration.js";
import { registerLabelCommands } from "./commands/label.js";
import { registerNoteCommands } from "./commands/note.js";
import { registerPluginCommands } from "./commands/plugin.js";
import { registerProjectCommands } from "./commands/project.js";
import { registerRecurringCommands } from "./commands/recurring.js";
import { registerSyncCommands } from "./commands/sync.js";
import { registerTaskCommands } from "./commands/task.js";
import { createCliDaemonInvoker } from "./daemon-command-client.js";
import { setColorEnabled } from "./format.js";
import { VERSION } from "./version.js";
import { installTimeoutNegativeWarningFilter } from "./warnings.js";

// Suppress noisy Node.js TimeoutNegativeWarning caused by
// @automerge/automerge-repo passing negative delays to setTimeout.
installTimeoutNegativeWarningFilter();

const program = new Command();

program
  .name("todu")
  .description("Local-first task management")
  .version(VERSION)
  .option("--format <type>", "output format (text or json)", "text")
  .option("--config <path>", "path to config file")
  .option("--no-color", "disable color output")
  .hook("preAction", () => {
    if (!program.opts().color) {
      setColorEnabled(false);
    }
  });

const invokeDaemon = createCliDaemonInvoker(program);

// Register command groups
registerActorCommands(program, invokeDaemon);
registerApprovalCommands(program, invokeDaemon);
registerDaemonCommands(program, invokeDaemon);
registerProjectCommands(program, invokeDaemon);
registerTaskCommands(program, invokeDaemon);
registerLabelCommands(program, invokeDaemon);
registerNoteCommands(program, invokeDaemon);
registerRecurringCommands(program, invokeDaemon);
registerHabitCommands(program, invokeDaemon);
registerIntegrationCommands(program, invokeDaemon);
registerSyncCommands(program, invokeDaemon);
registerPluginCommands(program, invokeDaemon);
registerConfigCommands(program);

program.parse();
