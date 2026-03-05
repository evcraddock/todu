import fs from "node:fs";
import { createRequire } from "node:module";
import { initializeBase64Wasm, initializeWasm, isWasmInitialized } from "@automerge/automerge/slim";

let initPromise: Promise<void> | null = null;

function isBunRuntime(): boolean {
  return "Bun" in globalThis;
}

async function initializeAutomergeWasmRuntime(): Promise<void> {
  if (isBunRuntime()) {
    const { automergeWasmBase64 } = await import("@automerge/automerge/automerge.wasm.base64");
    await initializeBase64Wasm(automergeWasmBase64);
    return;
  }

  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("@automerge/automerge/automerge.wasm");
  const wasmBytes = fs.readFileSync(wasmPath);
  await initializeWasm(wasmBytes);
}

/**
 * Ensure Automerge WASM runtime is initialized exactly once per process.
 *
 * Node runtimes load bytes from the packaged .wasm file for startup speed.
 * Bun runtimes initialize from the packaged base64 blob to avoid filesystem
 * path resolution issues in standalone compiled CLI binaries.
 */
export async function ensureAutomergeWasmInitialized(): Promise<void> {
  if (isWasmInitialized()) {
    return;
  }

  if (initPromise === null) {
    initPromise = initializeAutomergeWasmRuntime().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  await initPromise;
}
