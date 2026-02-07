#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("todu-new")
  .description("Local-first task management")
  .version("0.0.1")
  .option("--format <type>", "output format (text or json)", "text");

// Subcommand groups — stubs for now, implemented in vertical slices
program
  .command("project")
  .description("Manage projects")
  .action(() => {
    program.commands.find((c) => c.name() === "project")?.outputHelp();
  });

program
  .command("task")
  .description("Manage tasks")
  .action(() => {
    program.commands.find((c) => c.name() === "task")?.outputHelp();
  });

program
  .command("label")
  .description("Manage labels")
  .action(() => {
    program.commands.find((c) => c.name() === "label")?.outputHelp();
  });

program
  .command("recurring")
  .description("Manage recurring templates")
  .action(() => {
    program.commands.find((c) => c.name() === "recurring")?.outputHelp();
  });

program
  .command("habit")
  .description("Manage habits")
  .action(() => {
    program.commands.find((c) => c.name() === "habit")?.outputHelp();
  });

program.parse();
