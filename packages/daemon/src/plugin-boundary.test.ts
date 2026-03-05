import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("plugin package dependency boundaries", () => {
  const rootDir = path.resolve(import.meta.dirname, "../../../");
  const recurringWorkerPackageName = "@todu/recurring-worker";

  it("daemon and core package manifests do not depend on recurring-worker package", () => {
    const daemonPackage = JSON.parse(
      fs.readFileSync(path.join(rootDir, "packages/daemon/package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const corePackage = JSON.parse(
      fs.readFileSync(path.join(rootDir, "packages/core/package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(daemonPackage.dependencies?.[recurringWorkerPackageName]).toBeUndefined();
    expect(daemonPackage.devDependencies?.[recurringWorkerPackageName]).toBeUndefined();
    expect(corePackage.dependencies?.[recurringWorkerPackageName]).toBeUndefined();
    expect(corePackage.devDependencies?.[recurringWorkerPackageName]).toBeUndefined();
  });

  it("daemon and core source trees do not import recurring-worker package", () => {
    const daemonSourceFiles = collectTypescriptFiles(path.join(rootDir, "packages/daemon/src"));
    const coreSourceFiles = collectTypescriptFiles(path.join(rootDir, "packages/core/src"));

    for (const filePath of [...daemonSourceFiles, ...coreSourceFiles]) {
      if (filePath.endsWith("plugin-boundary.test.ts")) {
        continue;
      }

      const source = fs.readFileSync(filePath, "utf8");
      expect(source).not.toContain(recurringWorkerPackageName);
    }
  });
});

function collectTypescriptFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTypescriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}
