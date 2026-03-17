import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { getConfigPath, loadConfig, resolveConfigSources, saveConfig } from "../config.js";
import { formatJSON } from "../format.js";

const DEFAULT_LOCAL_CONFIG_DIR = ".todu";
const LEGACY_LOCAL_CONFIG_DIR = ".toduai";

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Manage configuration");

  // show
  config
    .command("show")
    .description("Show resolved configuration")
    .action(() => {
      const opts = program.opts();
      const configPath = getConfigPath(opts.config);
      const fileConfig = loadConfig(configPath);
      const sources = resolveConfigSources(opts.config, fileConfig);
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
    .option("--dir <path>", "directory to create config in", DEFAULT_LOCAL_CONFIG_DIR)
    .action((opts) => {
      const dir = path.resolve(opts.dir);
      const configPath = path.join(dir, "config.yaml");

      if (fs.existsSync(configPath)) {
        console.log(`Config already exists: ${configPath}`);
        return;
      }

      const migratedFromLegacy = maybeMigrateLegacyProjectConfigDir(dir, opts.dir);
      if (migratedFromLegacy !== null) {
        console.log(`Migrated: ${migratedFromLegacy} -> ${dir}`);
        console.log(`Config available: ${configPath}`);
        console.log("");
        console.log("Usage:");
        console.log(`  todu --config ${configPath} task list`);
        return;
      }

      // Create config with data_dir relative to config location
      saveConfig({ data_dir: "./data" }, configPath);

      // Add .gitignore to keep data out of version control
      const gitignorePath = path.join(dir, ".gitignore");
      if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, "# Ignore todu data\ndata/\n", "utf-8");
        console.log(`Created: ${configPath}`);
        console.log(`Created: ${gitignorePath}`);
      } else {
        console.log(`Created: ${configPath}`);
      }
      console.log("");
      console.log("Usage:");
      console.log(`  todu --config ${configPath} task list`);
    });
}

function maybeMigrateLegacyProjectConfigDir(
  currentDir: string,
  requestedDir: string | undefined,
): string | null {
  if (requestedDir !== DEFAULT_LOCAL_CONFIG_DIR) {
    return null;
  }

  const legacyDir = path.join(path.dirname(currentDir), LEGACY_LOCAL_CONFIG_DIR);
  if (fs.existsSync(currentDir) || !fs.existsSync(legacyDir)) {
    return null;
  }

  fs.renameSync(legacyDir, currentDir);
  return legacyDir;
}
