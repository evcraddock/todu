import { VERSION } from "./version.js";

export type CliMode =
  | { kind: "app" }
  | { kind: "help"; output: string }
  | { kind: "version"; output: string };

export function resolveCliMode(args: readonly string[]): CliMode {
  if (args.includes("--version") || args.includes("-v")) {
    return { kind: "version", output: VERSION };
  }

  if (args.includes("--help") || args.includes("-h")) {
    return { kind: "help", output: getHelpText() };
  }

  return { kind: "app" };
}

export function getHelpText(): string {
  return [
    `todu-tui ${VERSION}`,
    "",
    "Usage: todu-tui [options]",
    "",
    "Options:",
    "  -h, --help     Show help",
    "  -v, --version  Show version",
    "",
    "Keyboard:",
    "  q or Ctrl+C    Quit",
  ].join("\n");
}
