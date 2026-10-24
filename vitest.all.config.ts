import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  test: {
    maxWorkers: "50%",
    globalSetup: ["./scripts/test-global-setup.ts"],
    include: ["packages/*/src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@todu/core/browser": path.resolve(root, "packages/core/src/browser.ts"),
      "@todu/core": path.resolve(root, "packages/core/src/index.ts"),
      "@todu/engine": path.resolve(root, "packages/engine/src/index.ts"),
      "@todu/cli": path.resolve(root, "packages/cli/src/index.ts"),
    },
  },
});
