import { describe, expect, it } from "vitest";
import { installTimeoutNegativeWarningFilter } from "./warnings.js";

type EmitWarningCall = [warning: string | Error, ...args: unknown[]];

type WarningProcess = {
  emitWarning: NodeJS.Process["emitWarning"];
};

function createWarningProcessStub(): {
  warningProcess: WarningProcess;
  calls: EmitWarningCall[];
} {
  const calls: EmitWarningCall[] = [];

  const warningProcess: WarningProcess = {
    emitWarning: ((warning: string | Error, ...args: unknown[]) => {
      calls.push([warning, ...args]);
    }) as NodeJS.Process["emitWarning"],
  };

  return { warningProcess, calls };
}

describe("installTimeoutNegativeWarningFilter", () => {
  it("suppresses TimeoutNegativeWarning emitted as string + type", () => {
    const { warningProcess, calls } = createWarningProcessStub();
    installTimeoutNegativeWarningFilter(warningProcess);

    warningProcess.emitWarning("-1 is a negative number.", "TimeoutNegativeWarning");

    expect(calls).toHaveLength(0);
  });

  it("suppresses TimeoutNegativeWarning emitted as Error instance", () => {
    const { warningProcess, calls } = createWarningProcessStub();
    installTimeoutNegativeWarningFilter(warningProcess);

    const warning = new Error("-1 is a negative number.");
    warning.name = "TimeoutNegativeWarning";
    warningProcess.emitWarning(warning);

    expect(calls).toHaveLength(0);
  });

  it("preserves unrelated warnings", () => {
    const { warningProcess, calls } = createWarningProcessStub();
    installTimeoutNegativeWarningFilter(warningProcess);

    warningProcess.emitWarning("this is a negative number", "SomeOtherWarning");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["this is a negative number", "SomeOtherWarning"]);
  });
});
