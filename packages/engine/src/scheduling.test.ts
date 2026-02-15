import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearProcessors,
  getRegisteredProcessors,
  type ProcessingContext,
  registerProcessor,
} from "./scheduling.js";

// We test processTemplates indirectly through createTodu integration
// Here we test the registration mechanism directly

describe("scheduling framework", () => {
  beforeEach(() => {
    clearProcessors();
  });

  afterEach(() => {
    clearProcessors();
  });

  it("starts with no registered processors", () => {
    expect(getRegisteredProcessors()).toHaveLength(0);
  });

  it("registers a processor", () => {
    registerProcessor("recurring", async () => 0);
    expect(getRegisteredProcessors()).toContain("recurring");
  });

  it("registers multiple processors", () => {
    registerProcessor("recurring", async () => 0);
    registerProcessor("habit", async () => 0);
    expect(getRegisteredProcessors()).toHaveLength(2);
    expect(getRegisteredProcessors()).toContain("recurring");
    expect(getRegisteredProcessors()).toContain("habit");
  });

  it("clears all processors", () => {
    registerProcessor("recurring", async () => 0);
    registerProcessor("habit", async () => 0);
    clearProcessors();
    expect(getRegisteredProcessors()).toHaveLength(0);
  });

  it("replaces processor with same type", () => {
    let _callCount = 0;
    registerProcessor("recurring", async () => {
      _callCount = 1;
      return 0;
    });
    registerProcessor("recurring", async () => {
      _callCount = 2;
      return 0;
    });
    expect(getRegisteredProcessors()).toHaveLength(1);
  });
});

describe("processTemplates integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-scheduling-"));
    clearProcessors();
  });

  afterEach(async () => {
    clearProcessors();
    // Give Automerge time to flush
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("runs registered processors during createTodu", async () => {
    let processorCalled = false;

    registerProcessor("test", async (ctx: ProcessingContext) => {
      processorCalled = true;
      // Verify we have access to the catalog
      expect(ctx.catalog).toBeDefined();
      expect(ctx.catalog.doc()).toBeDefined();
      return 0;
    });

    const { createTodu } = await import("./index.js");
    const todu = await createTodu({ storagePath: tmpDir });

    expect(processorCalled).toBe(true);

    await todu.close();
  });

  it("runs multiple processors in sequence", async () => {
    const order: string[] = [];

    registerProcessor("first", async () => {
      order.push("first");
      return 0;
    });

    registerProcessor("second", async () => {
      order.push("second");
      return 0;
    });

    const { createTodu } = await import("./index.js");
    const todu = await createTodu({ storagePath: tmpDir });

    expect(order).toEqual(["first", "second"]);

    await todu.close();
  });

  it("continues processing if one processor fails", async () => {
    const order: string[] = [];

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    registerProcessor("failing", async () => {
      order.push("failing");
      throw new Error("processor failed");
    });

    registerProcessor("succeeding", async () => {
      order.push("succeeding");
      return 1;
    });

    const { createTodu } = await import("./index.js");
    const todu = await createTodu({ storagePath: tmpDir });

    expect(order).toEqual(["failing", "succeeding"]);
    expect(consoleSpy).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
    await todu.close();
  });

  it("works with no registered processors", async () => {
    // Should not throw
    const { createTodu } = await import("./index.js");
    const todu = await createTodu({ storagePath: tmpDir });

    // Basic operations still work
    const result = await todu.project.list();
    expect(result.ok).toBe(true);

    await todu.close();
  });
});
