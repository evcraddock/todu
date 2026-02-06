import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@todu/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@todu/engine": path.resolve(__dirname, "packages/engine/src/index.ts"),
    },
  },
});
