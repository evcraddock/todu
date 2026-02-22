import { notFound, storageError, validationError } from "@todu/core";
import { describe, expect, it } from "vitest";
import {
  createProtocolError,
  createProtocolErrorFrame,
  createProtocolEventFrame,
  createProtocolSuccessFrame,
  mapErrorToProtocolError,
  type ProtocolError,
  parseProtocolRequestFrame,
  parseProtocolRequestJson,
} from "./protocol.js";

describe("parseProtocolRequestFrame", () => {
  it("parses valid request frames", () => {
    const parsed = parseProtocolRequestFrame({
      id: "1",
      method: "daemon.status",
      params: { verbose: true },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("Expected valid frame parse");
    }

    expect(parsed.value).toEqual({
      id: "1",
      method: "daemon.status",
      params: { verbose: true },
    });
  });

  it("defaults missing params to an empty object", () => {
    const parsed = parseProtocolRequestFrame({
      id: "2",
      method: "daemon.ping",
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("Expected valid frame parse");
    }

    expect(parsed.value.params).toEqual({});
  });

  it("returns BAD_REQUEST when frame is not an object", () => {
    const parsed = parseProtocolRequestFrame("not-an-object");
    expectProtocolError(parsed, "BAD_REQUEST", "Protocol request frame must be an object");
  });

  it("returns BAD_REQUEST when id is invalid", () => {
    const parsed = parseProtocolRequestFrame({
      id: 12,
      method: "daemon.ping",
    });

    expectProtocolError(parsed, "BAD_REQUEST", "Protocol request id must be a non-empty string");
  });

  it("returns BAD_REQUEST when method is invalid", () => {
    const parsed = parseProtocolRequestFrame({
      id: "1",
      method: null,
    });

    expectProtocolError(
      parsed,
      "BAD_REQUEST",
      "Protocol request method must be a non-empty string",
    );
  });

  it("returns BAD_REQUEST when params is not an object", () => {
    const parsed = parseProtocolRequestFrame({
      id: "1",
      method: "daemon.ping",
      params: "invalid",
    });

    expectProtocolError(parsed, "BAD_REQUEST", "Protocol request params must be an object");
  });
});

describe("parseProtocolRequestJson", () => {
  it("returns BAD_REQUEST for invalid JSON payloads", () => {
    const parsed = parseProtocolRequestJson("{ invalid-json }");
    expectProtocolError(parsed, "BAD_REQUEST", "Protocol payload is not valid JSON");
  });
});

describe("mapErrorToProtocolError", () => {
  it("keeps protocol errors stable", () => {
    const mapped = mapErrorToProtocolError(
      createProtocolError("METHOD_NOT_FOUND", "Unknown method", { method: "bad.method" }),
    );

    expect(mapped).toEqual({
      code: "METHOD_NOT_FOUND",
      message: "Unknown method",
      details: { method: "bad.method" },
    });
  });

  it("maps domain not-found errors to NOT_FOUND", () => {
    const mapped = mapErrorToProtocolError(notFound("task", "123"));
    expect(mapped.code).toBe("NOT_FOUND");
    expect(mapped.message).toBe("task not found: 123");
  });

  it("maps domain validation errors to VALIDATION_ERROR", () => {
    const mapped = mapErrorToProtocolError(validationError("title", "required"));
    expect(mapped.code).toBe("VALIDATION_ERROR");
    expect(mapped.message).toBe("required");
    expect(mapped.details).toEqual({ field: "title" });
  });

  it("maps domain storage errors to INTERNAL_ERROR", () => {
    const mapped = mapErrorToProtocolError(storageError("disk unavailable"));
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.message).toBe("disk unavailable");
  });

  it("maps timeout-like errors to TIMEOUT", () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "TimeoutError";

    const mapped = mapErrorToProtocolError(timeoutError);
    expect(mapped.code).toBe("TIMEOUT");
    expect(mapped.message).toBe("request timed out");
  });

  it("maps unknown errors to INTERNAL_ERROR", () => {
    const mapped = mapErrorToProtocolError({ something: "unexpected" });
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.message).toBe("Unexpected internal error");
  });
});

describe("frame helpers", () => {
  it("builds success and error response frames", () => {
    const success = createProtocolSuccessFrame("1", { pong: true });
    expect(success).toEqual({ id: "1", result: { pong: true } });

    const error = createProtocolErrorFrame("1", validationError("field", "bad"));
    expect(error.id).toBe("1");
    expect(error.error.code).toBe("VALIDATION_ERROR");
  });

  it("builds reusable event frames", () => {
    const event = createProtocolEventFrame(
      "data.changed",
      { scope: "task" },
      "2026-02-22T00:00:00.000Z",
    );
    expect(event).toEqual({
      event: "data.changed",
      payload: { scope: "task" },
      ts: "2026-02-22T00:00:00.000Z",
    });
  });
});

function expectProtocolError(
  result:
    | ReturnType<typeof parseProtocolRequestFrame>
    | ReturnType<typeof parseProtocolRequestJson>,
  code: ProtocolError["code"],
  message: string,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected protocol parse error");
  }

  expect(result.error.code).toBe(code);
  expect(result.error.message).toBe(message);
}
