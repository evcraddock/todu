import { describe, expect, it } from "vitest";
import { validateEnrollmentInput } from "./enrollment.js";

const valid = {
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  device: { id: "native-replica-id", name: "Laptop" },
};

describe("enrollment request validation", () => {
  it("accepts native identity and readable metadata without inventing membership", () => {
    expect(validateEnrollmentInput(valid)).toEqual({ ok: true, value: valid });
  });
  it("accepts an optional existing catalog and listening base endpoint", () => {
    const input = {
      ...valid,
      expectedCatalogId: "existing-catalog",
      device: { ...valid.device, endpoint: "http://laptop.lan:24377" },
    };
    expect(validateEnrollmentInput(input)).toEqual({ ok: true, value: input });
  });
  it.each([
    null,
    [],
    {},
    { ...valid, requestId: "../requests" },
    { ...valid, device: { id: "", name: "Laptop" } },
    { ...valid, device: { id: "../replica", name: "Laptop" } },
    { ...valid, device: { id: "native-id", name: "" } },
    { ...valid, device: { ...valid.device, endpoint: "ws://host/sync/catalog" } },
    { ...valid, device: { ...valid.device, endpoint: "http://user:password@host" } },
    { ...valid, expectedCatalogId: "" },
    { ...valid, documents: [{ content: "not registration metadata" }] },
    { ...valid, device: { ...valid.device, removed: false } },
  ])("rejects malformed, unexpected, or document-bearing payloads: %s", (input) => {
    expect(validateEnrollmentInput(input)).toMatchObject({
      ok: false,
      error: { type: "validation" },
    });
  });
});
