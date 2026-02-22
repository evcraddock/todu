const TIMEOUT_WARNING_TYPE = "TimeoutNegativeWarning";
const NEGATIVE_DELAY_MESSAGE = "is a negative number";

type EmitWarning = NodeJS.Process["emitWarning"];

type WarningProcess = {
  emitWarning: EmitWarning;
};

function isTimeoutNegativeWarning(warning: string | Error, args: unknown[]): boolean {
  const message = typeof warning === "string" ? warning : warning.message;
  const type =
    typeof warning === "string"
      ? typeof args[0] === "string"
        ? args[0]
        : undefined
      : warning.name;

  return type === TIMEOUT_WARNING_TYPE && message.includes(NEGATIVE_DELAY_MESSAGE);
}

export function installTimeoutNegativeWarningFilter(
  warningProcess: WarningProcess = process,
): void {
  const originalEmitWarning = warningProcess.emitWarning;

  warningProcess.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    if (isTimeoutNegativeWarning(warning, args)) {
      return;
    }

    Reflect.apply(
      originalEmitWarning as unknown as (...forwarded: unknown[]) => void,
      warningProcess,
      [warning, ...args],
    );
  }) as EmitWarning;
}
