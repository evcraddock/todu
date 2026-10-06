#!/usr/bin/env node
import { resolveCliMode } from "./cli.js";
import { startTui } from "./startup.js";

const mode = resolveCliMode(process.argv.slice(2));

if (mode.kind === "app") {
  if (!(await startTui())) {
    process.exitCode = 1;
  }
} else {
  console.log(mode.output);
}
