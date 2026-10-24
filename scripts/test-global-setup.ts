import { execSync } from "node:child_process";
import path from "node:path";
import type { TestProject } from "vitest/node";

function buildWorkspace() {
  execSync("npm run build", {
    cwd: path.resolve(import.meta.dirname, ".."),
    stdio: "inherit",
    timeout: 120000,
  });
}

export default function setup(project: TestProject) {
  buildWorkspace();
  project.onTestsRerun(buildWorkspace);
}
