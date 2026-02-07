import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@todu/core": path.resolve(root, "packages/core/src/index.ts"),
      "@todu/engine": path.resolve(root, "packages/engine/src/index.ts"),
    },
  },
});
