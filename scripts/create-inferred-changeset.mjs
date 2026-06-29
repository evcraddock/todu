#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = new URL("..", import.meta.url).pathname;

function parseArgs(argv) {
  const options = {
    base: "auto",
    bump: "patch",
    dryRun: false,
    summary: "Release updated packages.",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") {
      options.base = argv[++index];
    } else if (arg === "--bump") {
      options.bump = argv[++index];
    } else if (arg === "--summary") {
      options.summary = argv[++index];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  if (!["patch", "minor", "major"].includes(options.bump)) {
    console.error(`Invalid bump: ${options.bump}`);
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.log(`Create a Changesets entry from changed workspace package files.

Usage:
  node scripts/create-inferred-changeset.mjs [--base auto|origin/main|<ref>] [--bump patch|minor|major] [--summary "..."] [--dry-run]

Default behavior:
  - On feature branches, compare with origin/main plus working tree changes.
  - On main, compare each package with the commit where its current package version was set.
  - Private and ignored workspaces are skipped.`);
}

function run(args) {
  return spawnSync(args[0], args.slice(1), {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function gitLines(args) {
  const result = run(["git", ...args]);
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function gitLine(args) {
  return gitLines(args)[0] ?? null;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function getCurrentBranch() {
  return gitLine(["branch", "--show-current"]);
}

function getIgnoredPackages() {
  const configPath = join(repoRoot, ".changeset/config.json");
  if (!existsSync(configPath)) {
    return new Set();
  }

  const config = readJson(configPath);
  return new Set(config.ignore ?? []);
}

function getWorkspacePackages() {
  const ignored = getIgnoredPackages();
  const packagesDir = join(repoRoot, "packages");

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const packageDir = join(packagesDir, entry.name);
      const packageJsonPath = join(packageDir, "package.json");
      if (!existsSync(packageJsonPath)) {
        return null;
      }

      const packageJson = readJson(packageJsonPath);
      return {
        name: packageJson.name,
        dir: relative(repoRoot, packageDir).replaceAll("\\", "/"),
        private: packageJson.private === true,
        ignored: ignored.has(packageJson.name),
      };
    })
    .filter(Boolean);
}

function getWorkingTreeFiles() {
  return [
    ...gitLines(["diff", "--name-only", "--diff-filter=ACMRTUXB"]),
    ...gitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"]),
  ];
}

function getChangedFilesFromBase(base) {
  return [
    ...gitLines(["diff", "--name-only", "--diff-filter=ACMRTUXB", `${base}...HEAD`]),
    ...getWorkingTreeFiles(),
  ];
}

function getLastVersionCommit(workspacePackage) {
  return gitLine([
    "log",
    "-G",
    '"version"\\s*:',
    "--format=%H",
    "-n",
    "1",
    "--",
    `${workspacePackage.dir}/package.json`,
  ]);
}

function getChangedFilesOnMain(packages) {
  const files = new Set(getWorkingTreeFiles());

  for (const workspacePackage of packages) {
    const versionCommit = getLastVersionCommit(workspacePackage);
    if (!versionCommit) {
      continue;
    }

    for (const file of gitLines([
      "diff",
      "--name-only",
      "--diff-filter=ACMRTUXB",
      `${versionCommit}..HEAD`,
      "--",
      workspacePackage.dir,
    ])) {
      files.add(file);
    }
  }

  return [...files];
}

function getChangedFiles(base, packages) {
  if (base !== "auto") {
    return getChangedFilesFromBase(base);
  }

  if (getCurrentBranch() === "main") {
    return getChangedFilesOnMain(packages);
  }

  return getChangedFilesFromBase("origin/main");
}

function getExistingChangesetPackages() {
  const changesetDir = join(repoRoot, ".changeset");
  if (!existsSync(changesetDir)) {
    return new Set();
  }

  const packages = new Set();
  for (const entry of readdirSync(changesetDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "README.md") {
      continue;
    }

    const content = readFileSync(join(changesetDir, entry.name), "utf8");
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatter) {
      continue;
    }

    for (const match of frontmatter[1].matchAll(/["']([^"']+)["']:\s+(patch|minor|major)/g)) {
      packages.add(match[1]);
    }
  }

  return packages;
}

function createChangeset(packages, bump, summary) {
  const body = [
    "---",
    ...packages.map((packageName) => `"${packageName}": ${bump}`),
    "---",
    "",
    summary,
    "",
  ].join("\n");

  const name = `inferred-${Date.now().toString(36)}.md`;
  return {
    path: join(repoRoot, ".changeset", name),
    body,
  };
}

const options = parseArgs(process.argv.slice(2));
const packages = getWorkspacePackages();
const changedFiles = [...new Set(getChangedFiles(options.base, packages))];
const existingChangesetPackages = getExistingChangesetPackages();
const changedPackages = packages.filter((workspacePackage) =>
  changedFiles.some((file) => file === workspacePackage.dir || file.startsWith(`${workspacePackage.dir}/`)),
);
const publishablePackages = changedPackages.filter(
  (workspacePackage) => !workspacePackage.private && !workspacePackage.ignored,
);
const packagesNeedingChangeset = publishablePackages
  .map((workspacePackage) => workspacePackage.name)
  .filter((packageName) => !existingChangesetPackages.has(packageName))
  .sort();

if (changedFiles.length === 0) {
  console.log("No changed files found.");
  process.exit(0);
}

if (changedPackages.length === 0) {
  console.log("No changed workspace packages found.");
  console.log("Changed files:");
  for (const file of changedFiles) {
    console.log(`- ${file}`);
  }
  process.exit(0);
}

const skippedPackages = changedPackages.filter(
  (workspacePackage) => workspacePackage.private || workspacePackage.ignored,
);
if (skippedPackages.length > 0) {
  console.log("Skipped private/ignored packages:");
  for (const workspacePackage of skippedPackages) {
    console.log(`- ${workspacePackage.name}`);
  }
}

if (packagesNeedingChangeset.length === 0) {
  console.log("No new changeset needed. Changed publishable packages already have changesets or are ignored/private.");
  process.exit(0);
}

const changeset = createChangeset(packagesNeedingChangeset, options.bump, options.summary);

if (options.dryRun) {
  console.log(`Would create ${relative(repoRoot, changeset.path)}:`);
  console.log(changeset.body);
  process.exit(0);
}

mkdirSync(join(repoRoot, ".changeset"), { recursive: true });
writeFileSync(changeset.path, changeset.body);

console.log(`Created ${relative(repoRoot, changeset.path)} for:`);
for (const packageName of packagesNeedingChangeset) {
  console.log(`- ${packageName}: ${options.bump}`);
}
console.log(`Summary: ${options.summary}`);
