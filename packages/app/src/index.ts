#!/usr/bin/env node
/**
 * todu - Local-first task management
 *
 * This is the unified entry point for both CLI and Electron modes.
 *
 * Mode detection:
 * - If subcommand provided → CLI mode
 * - If --gui flag → Electron mode
 * - If interactive terminal, no args → Electron mode (future)
 * - If piped/no TTY → CLI mode
 *
 * For now (Phase 1), only CLI mode is implemented.
 * Electron mode will be added in Phase 2.
 */

import { Command } from "commander";

const program = new Command();

program
  .name("todu")
  .description("Local-first task management with offline support and seamless sync")
  .version("0.0.1");

// Placeholder commands - will be implemented in task #1578 (Task Management)
program
  .command("task")
  .description("Manage tasks")
  .action(() => {
    console.log("Task commands coming soon...");
  });

// Placeholder - will be implemented in task #1579 (Project Management)
program
  .command("project")
  .description("Manage projects")
  .action(() => {
    console.log("Project commands coming soon...");
  });

// Placeholder - will be implemented in task #1580 (Label Management)
program
  .command("label")
  .description("Manage labels")
  .action(() => {
    console.log("Label commands coming soon...");
  });

// Placeholder - will be implemented in task #1583 (Recurring Template CRUD)
program
  .command("recurring")
  .description("Manage recurring task templates")
  .action(() => {
    console.log("Recurring commands coming soon...");
  });

program.parse();
