import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.integration.test.{ts,tsx}",
    ],
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
