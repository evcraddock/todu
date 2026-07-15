export interface MarkdownSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  color?: "cyan" | "gray" | "white";
}

export interface MarkdownLine {
  text: string;
  spans: readonly MarkdownSpan[];
  color: "cyan" | "gray" | "white";
  bold?: boolean;
}

export function renderMarkdownLines({
  id,
  markdown,
  maxWidth,
  color = "white",
}: {
  id: string;
  markdown: string;
  maxWidth: number;
  color?: MarkdownLine["color"];
}): readonly (MarkdownLine & { id: string })[] {
  const lines: Array<MarkdownLine & { id: string }> = [];
  const sourceLines = markdown.split(/\r?\n/);
  let codeBlock = false;

  for (const sourceLine of sourceLines) {
    if (/^\s*```/.test(sourceLine)) {
      codeBlock = !codeBlock;
      continue;
    }

    const block = parseBlock(sourceLine, codeBlock, color);
    const wrapped = wrapMarkdownSpans(block.spans, maxWidth);
    for (const spans of wrapped) {
      lines.push({
        id: `${id}-${lines.length}`,
        text: spans.map((span) => span.text).join(""),
        spans,
        color: block.color,
        bold: block.bold,
      });
    }
  }

  return lines.length > 0 ? lines : [{ id: `${id}-0`, text: "", spans: [], color }];
}

function parseBlock(
  sourceLine: string,
  codeBlock: boolean,
  defaultColor: MarkdownLine["color"],
): MarkdownLine {
  if (codeBlock) {
    return { text: sourceLine, spans: [{ text: sourceLine }], color: "gray" };
  }

  const heading = /^(#{1,6})\s+(.+)$/.exec(sourceLine);
  if (heading) {
    const text = heading[2] ?? "";
    return { text, spans: parseInline(text), color: "cyan", bold: true };
  }

  const bullet = /^\s*[-*+]\s+(.+)$/.exec(sourceLine);
  if (bullet) {
    return {
      text: `• ${bullet[1] ?? ""}`,
      spans: [{ text: "• " }, ...parseInline(bullet[1] ?? "")],
      color: defaultColor,
    };
  }

  const ordered = /^\s*(\d+[.)])\s+(.+)$/.exec(sourceLine);
  if (ordered) {
    const marker = ordered[1] ?? "";
    const content = ordered[2] ?? "";
    return {
      text: `${marker} ${content}`,
      spans: [{ text: `${marker} ` }, ...parseInline(content)],
      color: defaultColor,
    };
  }

  const quote = /^>\s?(.*)$/.exec(sourceLine);
  if (quote) {
    const content = quote[1] ?? "";
    return {
      text: `│ ${content}`,
      spans: [{ text: "│ ", color: "gray" }, ...parseInline(content)],
      color: "gray",
    };
  }

  return { text: sourceLine, spans: parseInline(sourceLine), color: defaultColor };
}

function parseInline(value: string): readonly MarkdownSpan[] {
  const spans: MarkdownSpan[] = [];
  let remaining = value;

  while (remaining) {
    const match =
      /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^\s)]+\))/.exec(
        remaining,
      );
    if (!match || match.index === undefined) {
      spans.push({ text: remaining });
      break;
    }

    if (match.index > 0) {
      spans.push({ text: remaining.slice(0, match.index) });
    }

    const token = match[0];
    if (token.startsWith("`")) {
      spans.push({ text: token.slice(1, -1), color: "gray" });
    } else if (token.startsWith("**") || token.startsWith("__")) {
      spans.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith("~~")) {
      spans.push({ text: token.slice(2, -2), strikethrough: true });
    } else if (token.startsWith("[") && token.includes("](")) {
      const [, label = "", url = ""] = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(token) ?? [];
      spans.push({ text: label, color: "cyan" }, { text: ` <${url}>`, color: "gray" });
    } else {
      spans.push({ text: token.slice(1, -1), italic: true });
    }

    remaining = remaining.slice(match.index + token.length);
  }

  return spans;
}

function wrapMarkdownSpans(
  spans: readonly MarkdownSpan[],
  maxWidth: number,
): readonly MarkdownSpan[][] {
  const width = Math.max(1, maxWidth);
  const lines: MarkdownSpan[][] = [];
  let line: MarkdownSpan[] = [];
  let lineWidth = 0;

  const append = (span: MarkdownSpan): void => {
    const previous = line.at(-1);
    if (previous && sameStyle(previous, span)) {
      previous.text += span.text;
    } else {
      line.push({ ...span });
    }
    lineWidth += span.text.length;
  };
  const pushLine = (): void => {
    const lastSpan = line.at(-1);
    if (lastSpan?.text.endsWith(" ")) {
      lastSpan.text = lastSpan.text.slice(0, -1);
    }
    lines.push(line);
    line = [];
    lineWidth = 0;
  };

  for (const span of spans) {
    for (const token of span.text.replace(/\s+/g, " ").split(/( )/)) {
      if (!token) {
        continue;
      }
      if (token === " ") {
        if (lineWidth > 0 && lineWidth < width) {
          append({ ...span, text: " " });
        }
        continue;
      }

      let word = token;
      if (lineWidth > 0 && lineWidth + word.length > width) {
        pushLine();
      }
      while (word.length > width) {
        append({ ...span, text: word.slice(0, width - lineWidth) });
        pushLine();
        word = word.slice(width);
      }
      append({ ...span, text: word });
    }
  }

  if (line.length > 0 || lines.length === 0) {
    lines.push(line);
  }
  return lines;
}

function sameStyle(left: MarkdownSpan, right: MarkdownSpan): boolean {
  return (
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.strikethrough === right.strikethrough &&
    left.color === right.color
  );
}
