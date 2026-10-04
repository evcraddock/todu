import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(import.meta.dirname, "..");
const workflow = readFileSync(path.join(rootDir, ".github/workflows/npm-release.yml"), "utf8");

describe("npm trusted publishing", () => {
  it("allows the release job to request OIDC tokens without repository write access", () => {
    const permissions = workflow.match(/^ {4}permissions:\n((?: {6}.+\n)+)/m)?.[1];
    expect(permissions).toBeDefined();
    expect(permissions).toMatch(/^ {6}contents: read$/m);
    expect(permissions).toMatch(/^ {6}id-token: write$/m);
    expect(permissions?.trim().split("\n")).toHaveLength(2);
  });

  it("uses a GitHub-hosted runner and a Node version with trusted-publishing support", () => {
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).toContain('NODE_VERSION: "24"');
    expect(workflow).toMatch(/node-version: \$\{\{ env\.NODE_VERSION \}\}/);
  });

  it("does not inject long-lived npm publishing credentials", () => {
    expect(workflow).not.toMatch(/secrets\.NPM_TOKEN|NODE_AUTH_TOKEN|^\s*NPM_TOKEN:/m);
  });

  it("publishes through Changesets only after local versioning is complete", () => {
    expect(workflow).toContain("should_publish=false");
    expect(workflow).toContain("if: steps.pending-changesets.outputs.should_publish == 'true'");
    expect(workflow).toContain("run: npm run release-packages");
    const manifest = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts["release-packages"]).toBe("npm run build && changeset publish");
  });

  it.each([
    "core",
    "engine",
    "daemon",
    "cli",
    "tui",
  ])("matches the trusted GitHub repository for @todu/%s", (packageName) => {
    const manifest = JSON.parse(
      readFileSync(path.join(rootDir, "packages", packageName, "package.json"), "utf8"),
    ) as { repository: { url: string }; private?: boolean };
    expect(manifest.private).not.toBe(true);
    expect(manifest.repository.url).toBe("https://github.com/evcraddock/todu.git");
  });
});
