import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it.each(["cli", "tui", "recurring-worker"])(
  "%s version generation avoids unchanged writes and refreshes changed versions",
  (name) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-version-generator-"));
    try {
      const script = path.join(dir, "generate-version.mjs");
      const manifest = path.join(dir, "package.json");
      const output = path.join(dir, "src/version.ts");
      fs.mkdirSync(path.join(dir, "src"));
      fs.copyFileSync(
        path.resolve(import.meta.dirname, `../packages/${name}/generate-version.mjs`),
        script,
      );
      fs.writeFileSync(manifest, JSON.stringify({ version: "1.2.3" }));
      const generate = () => execFileSync(process.execPath, [script], { timeout: 10000 });

      generate();
      expect(fs.readFileSync(output, "utf-8")).toContain('VERSION = "1.2.3"');
      fs.utimesSync(output, 1000, 1000);
      generate();
      expect(fs.statSync(output).mtimeMs).toBe(1000000);

      fs.writeFileSync(manifest, JSON.stringify({ version: "2.0.0" }));
      generate();
      expect(fs.readFileSync(output, "utf-8")).toContain('VERSION = "2.0.0"');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
  30000,
);
