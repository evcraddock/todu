#!/usr/bin/env node
import { render } from "ink";
import { App } from "./app/App.js";
import { resolveCliMode } from "./cli.js";

const mode = resolveCliMode(process.argv.slice(2));

if (mode.kind === "app") {
  render(<App />);
} else {
  console.log(mode.output);
}
