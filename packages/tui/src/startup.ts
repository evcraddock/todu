export interface TuiStartupOutput {
  isTTY?: boolean;
  write(text: string): unknown;
}

export interface TuiStartupOptions {
  output?: TuiStartupOutput;
  errorOutput?: TuiStartupOutput;
  load?: () => Promise<() => void>;
}

export async function startTui({
  output = process.stdout,
  errorOutput = process.stderr,
  load = loadTuiRenderer,
}: TuiStartupOptions = {}): Promise<boolean> {
  let startupVisible = output.isTTY === true;
  const clearStartupMessage = (): void => {
    if (startupVisible) {
      output.write("\u001b[1A\u001b[2K");
      startupVisible = false;
    }
  };

  if (startupVisible) {
    output.write("Starting Todu TUI…\n");
  }

  try {
    const render = await load();
    clearStartupMessage();
    render();
    return true;
  } catch (error) {
    clearStartupMessage();
    const reason = error instanceof Error ? error.message : "Unknown initialization error";
    errorOutput.write(`Todu TUI startup failed: ${reason}\n`);
    return false;
  }
}

async function loadTuiRenderer(): Promise<() => void> {
  const [{ render }, { createElement }, { App }] = await Promise.all([
    import("ink"),
    import("react"),
    import("./app/App.js"),
  ]);
  return () => {
    render(createElement(App));
  };
}
