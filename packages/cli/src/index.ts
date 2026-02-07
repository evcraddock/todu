#!/usr/bin/env node

import { createTodu } from "@todu/engine";
import { Command } from "commander";
import { registerProjectCommands } from "./commands/project.js";

const program = new Command();

program
  .name("todu-new")
  .description("Local-first task management")
  .version("0.0.1")
  .option("--format <type>", "output format (text or json)", "text");

// Lazy initialization — only create Todu instance when a command runs
const getTodu = () => {
  const storagePath = process.env.TODU_DATA_DIR;
  return createTodu(storagePath ? { storagePath } : undefined);
};

// Register command groups
registerProjectCommands(program, getTodu);

// Stubs for future vertical slices
program.command("task").description("Manage tasks (coming soon)");
program.command("label").description("Manage labels (coming soon)");
program.command("recurring").description("Manage recurring templates (coming soon)");
program.command("habit").description("Manage habits (coming soon)");

program.parse();
