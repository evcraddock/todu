import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(import.meta.dirname, "..");
const packageDir = path.join(rootDir, "packages/recurring-worker");

describe("recurring-worker version generation", () => {
  it("regenerates the constant from package metadata after a version bump", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "todu-worker-version-"));
    try {
      mkdirSync(path.join(directory, "src"));
      copyFileSync(
        path.join(packageDir, "generate-version.mjs"),
        path.join(directory, "generate-version.mjs"),
      );

      for (const version of ["0.1.1", "0.2.0-next.1"]) {
        writeFileSync(path.join(directory, "package.json"), JSON.stringify({ version }));
        execFileSync(process.execPath, [path.join(directory, "generate-version.mjs")], {
          cwd: tmpdir(),
          timeout: 10_000,
        });
        expect(readFileSync(path.join(directory, "src/version.ts"), "utf8")).toContain(
          `export const VERSION = "${version}";`,
        );
      }
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it("regenerates versions before build, typecheck, and repository versioning", () => {
    const manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      private: boolean;
    };
    expect(manifest.scripts.prebuild).toBe("node generate-version.mjs");
    expect(manifest.scripts.pretypecheck).toBe("node generate-version.mjs");
    expect(
      readFileSync(path.join(rootDir, "scripts/generate-package-versions.mjs"), "utf8"),
    ).toContain('"packages/recurring-worker/generate-version.mjs"');
    expect(manifest.private).toBe(true);
    const changesets = JSON.parse(
      readFileSync(path.join(rootDir, ".changeset/config.json"), "utf8"),
    ) as {
      ignore: string[];
    };
    expect(changesets.ignore).toContain("@todu/recurring-worker");
  });
});
