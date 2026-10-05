interface ActivityOutput {
  isTTY?: boolean;
  write(text: string): unknown;
}

/** Show activity, not a percentage or confirmation of storage progress. */
export async function withActivityIndicator<T>(options: {
  message: string;
  enabled: boolean;
  operation: () => Promise<T>;
  output?: ActivityOutput;
}): Promise<T> {
  const output = options.output ?? process.stderr;
  if (!options.enabled || !output.isTTY) return options.operation();

  let dots = 1;
  const render = () => {
    output.write(`\r\u001b[2K${options.message}${".".repeat(dots)}`);
    dots = (dots % 3) + 1;
  };
  render();
  const timer = setInterval(render, 250);
  try {
    return await options.operation();
  } finally {
    clearInterval(timer);
    output.write("\r\u001b[2K");
  }
}
