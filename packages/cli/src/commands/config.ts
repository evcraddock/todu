import fs from "node:fs";
import path from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { type ToduFileConfig, validateActorDisplayName, validateActorId } from "@todu/core";
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
    .action(async (opts) => {
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

      const config = await promptForInitConfig();

      // Create config with data_dir relative to config location
      saveConfig(config, configPath);

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

async function promptForInitConfig(): Promise<ToduFileConfig> {
  const prompts = await createPromptSession();

  try {
    const ownerActorId = await promptUntilValid(
      prompts,
      "Owner actor ID: ",
      (value) => validateActorId("identity.ownerActor.id", value.trim())?.message ?? null,
    );
    const displayName = await promptUntilValid(
      prompts,
      "Display name: ",
      (value) =>
        validateActorDisplayName("identity.ownerActor.displayName", value.trim())?.message ?? null,
    );
    const configureSync = await promptYesNo(prompts, "Configure a sync server? [y/N] ");

    const config: ToduFileConfig = {
      data_dir: "./data",
      identity: {
        ownerActor: {
          id: ownerActorId.trim(),
          displayName: displayName.trim(),
        },
      },
    };

    if (configureSync) {
      const server = await promptUntilValid(prompts, "Sync server: ", (value) =>
        value.trim().length > 0 ? null : "Sync server must be a non-empty string",
      );
      config.sync = {
        remote: {
          server: server.trim(),
          enabled: true,
        },
      };
    }

    return config;
  } finally {
    prompts.close();
  }
}

interface PromptSession {
  question(prompt: string): Promise<string>;
  close(): void;
}

async function createPromptSession(): Promise<PromptSession> {
  if (stdin.isTTY && stdout.isTTY) {
    const rl = createInterface({ input: stdin, output: stdout });
    return {
      question: (prompt) => rl.question(prompt),
      close: () => rl.close(),
    };
  }

  const bufferedAnswers = splitPromptAnswers(await readStdin());
  let answerIndex = 0;

  return {
    question: async (prompt) => {
      stdout.write(prompt);
      const answer = bufferedAnswers[answerIndex] ?? "";
      answerIndex += 1;
      return answer;
    },
    close: () => {},
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function splitPromptAnswers(input: string): string[] {
  if (input.length === 0) {
    return [];
  }

  const answers = input.split(/\r?\n/);
  if (answers.at(-1) === "") {
    answers.pop();
  }
  return answers;
}

async function promptUntilValid(
  prompts: PromptSession,
  prompt: string,
  validate: (value: string) => string | null,
): Promise<string> {
  while (true) {
    const answer = await prompts.question(prompt);
    const error = validate(answer);
    if (error === null) {
      return answer;
    }

    console.log(`Error: ${error}`);
  }
}

async function promptYesNo(prompts: PromptSession, prompt: string): Promise<boolean> {
  while (true) {
    const answer = (await prompts.question(prompt)).trim().toLowerCase();
    if (answer === "" || answer === "n" || answer === "no") {
      return false;
    }
    if (answer === "y" || answer === "yes") {
      return true;
    }

    console.log("Error: enter y or n");
  }
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
