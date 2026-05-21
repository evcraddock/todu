import { describe, expect, it } from "vitest";
import {
  createDaemonLogger,
  resolveDaemonLogLevel,
  resolveDaemonLogLevelFromEnv,
  TODU_LOG_LEVEL_ENV,
} from "./logger.js";

describe("daemon logger", () => {
  it("defaults to info level from env resolver", () => {
    expect(resolveDaemonLogLevelFromEnv({})).toBe("info");
  });

  it("uses TODU_LOG_LEVEL", () => {
    expect(resolveDaemonLogLevelFromEnv({ [TODU_LOG_LEVEL_ENV]: "debug" })).toBe("debug");
  });

  it("parses log level values case-insensitively", () => {
    expect(resolveDaemonLogLevel("DEBUG")).toBe("debug");
    expect(resolveDaemonLogLevel("Info")).toBe("info");
    expect(resolveDaemonLogLevel("warning")).toBe("warn");
    expect(resolveDaemonLogLevel("error")).toBe("error");
  });

  it("falls back to info for invalid log level values", () => {
    expect(resolveDaemonLogLevel("verbose")).toBe("info");
  });

  it("filters messages below selected level", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const logger = createDaemonLogger({
      level: "warn",
      component: "daemon.test",
      now: () => "2026-02-23T00:00:00.000Z",
      writeStdout: (line) => stdout.push(line),
      writeStderr: (line) => stderr.push(line),
    });

    logger.debug("debug message", { requestId: "1" });
    logger.info("info message", { requestId: "2" });
    logger.warn("warn message", { requestId: "3" });
    logger.error("error message", { requestId: "4" });

    expect(stdout).toHaveLength(0);
    expect(stderr).toHaveLength(2);

    const warn = JSON.parse(stderr[0]);
    expect(warn.level).toBe("warn");
    expect(warn.component).toBe("daemon.test");
    expect(warn.context.requestId).toBe("3");

    const error = JSON.parse(stderr[1]);
    expect(error.level).toBe("error");
    expect(error.context.requestId).toBe("4");
  });

  it("writes info/debug to stdout and warn/error to stderr", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const logger = createDaemonLogger({
      level: "debug",
      component: "daemon.test",
      now: () => "2026-02-23T00:00:00.000Z",
      writeStdout: (line) => stdout.push(line),
      writeStderr: (line) => stderr.push(line),
    });

    logger.debug("debug message", { method: "task.create" });
    logger.info("info message", { method: "task.create" });
    logger.warn("warn message", { errorCode: "BAD_REQUEST" });
    logger.error("error message", { errorCode: "INTERNAL_ERROR" });

    expect(stdout).toHaveLength(2);
    expect(stderr).toHaveLength(2);

    const debugEntry = JSON.parse(stdout[0]);
    expect(debugEntry.level).toBe("debug");
    expect(debugEntry.context.method).toBe("task.create");

    const infoEntry = JSON.parse(stdout[1]);
    expect(infoEntry.level).toBe("info");

    const warnEntry = JSON.parse(stderr[0]);
    expect(warnEntry.level).toBe("warn");

    const errorEntry = JSON.parse(stderr[1]);
    expect(errorEntry.level).toBe("error");
  });
});
