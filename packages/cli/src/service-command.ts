import { execFile } from "node:child_process";

export interface ServiceCommandResult {
  ok: boolean;
  message: string;
}

/** Keep the event loop responsive while a service manager waits for lifecycle work. */
export function runServiceCommand(options: {
  command: string;
  args: string[];
  timeoutMs?: number;
}): Promise<ServiceCommandResult> {
  return new Promise((resolve) => {
    execFile(
      options.command,
      options.args,
      { encoding: "utf8", timeout: options.timeoutMs ?? 30_000 },
      (error, stdout, stderr) => {
        resolve({
          ok: error === null,
          message: error ? stderr.trim() || stdout.trim() || error.message : stdout.trim(),
        });
      },
    );
  });
}
