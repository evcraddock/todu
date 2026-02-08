import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { getConfigPath, loadConfig, resolveConfigSources, saveConfig } from "../config.js";
import { formatJSON } from "../format.js";

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Manage configuration");

  // show
  config
    .command("show")
    .description("Show resolved configuration")
    .action(() => {
      const opts = program.opts();
      const sources = resolveConfigSources(opts.config);
      const configExists = fs.existsSync(sources.configPath);

      if (opts.format === "json") {
        console.log(
          formatJSON({
            configPath: sources.configPath,
            configSource: sources.configSource,
            configExists,
            dataDir: sources.dataDir,
            dataDirSource: sources.dataDirSource,
          }),
        );
        return;
      }

      console.log(`Config file:  ${sources.configPath}`);
      console.log(`              (${sources.configSource}${configExists ? "" : ", not found"})`);
      console.log(`Data dir:     ${sources.dataDir}`);
      console.log(`              (${sources.dataDirSource})`);
    });

  // init
  config
    .command("init")
    .description("Create a config file for local development")
    .option("--dir <path>", "directory to create config in", ".todu")
    .action((opts) => {
      const dir = path.resolve(opts.dir);
      const configPath = path.join(dir, "config.yaml");

      if (fs.existsSync(configPath)) {
        console.log(`Config already exists: ${configPath}`);
        return;
      }

      // Create config with data_dir relative to config location
      saveConfig({ data_dir: "./data" }, configPath);

      // Add .gitignore if in a git repo
      const gitignorePath = path.join(dir, ".gitignore");
      if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, "# Ignore todu data\ndata/\n", "utf-8");
      }

      console.log(`Created: ${configPath}`);
      console.log(`Created: ${gitignorePath}`);
      console.log("");
      console.log("Usage:");
      console.log(`  todu-new --config ${configPath} task list`);
    });
}
