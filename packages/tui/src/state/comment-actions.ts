import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class CommentEditorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentEditorError";
  }
}

interface EditorProcessResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

export interface ComposeTaskCommentOptions {
  env?: NodeJS.ProcessEnv;
  spawnEditor?: (command: string, args: readonly string[]) => EditorProcessResult;
}

interface ComposeEditorContentOptions extends ComposeTaskCommentOptions {
  documentLabel: string;
  temporaryPrefix: string;
  fileName: string;
}

export function normalizeCommentContent(content: string): string | null {
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function composeTaskComment(options: ComposeTaskCommentOptions = {}): string | null {
  return composeEditorContent({
    ...options,
    documentLabel: "comment",
    temporaryPrefix: "todu-comment-",
    fileName: "comment.md",
  });
}

export function composeJournalEntry(options: ComposeTaskCommentOptions = {}): string | null {
  return composeEditorContent({
    ...options,
    documentLabel: "journal entry",
    temporaryPrefix: "todu-journal-",
    fileName: "entry.md",
  });
}

function composeEditorContent({
  documentLabel,
  temporaryPrefix,
  fileName,
  env = process.env,
  spawnEditor = defaultSpawnEditor,
}: ComposeEditorContentOptions): string | null {
  const configuredEditor = env.VISUAL?.trim() || env.EDITOR?.trim();
  if (!configuredEditor) {
    throw new CommentEditorError("No terminal editor configured. Set VISUAL or EDITOR.");
  }

  const [command, ...editorArgs] = parseEditorCommand(configuredEditor);
  if (!command) {
    throw new CommentEditorError("No terminal editor configured. Set VISUAL or EDITOR.");
  }

  let temporaryDirectory: string | null = null;
  let content: string | null = null;
  let failure: unknown;

  try {
    temporaryDirectory = mkdtempSync(join(tmpdir(), temporaryPrefix));
    const contentPath = join(temporaryDirectory, fileName);
    writeFileSync(contentPath, "", { encoding: "utf8", mode: 0o600 });

    const result = spawnEditor(command, [...editorArgs, contentPath]);
    if (result.error) {
      throw new CommentEditorError(
        `Failed to launch terminal editor "${command}": ${result.error.message}`,
      );
    }
    if (result.signal) {
      throw new CommentEditorError(
        `Terminal editor "${command}" was terminated by ${result.signal}; ${documentLabel} was not added.`,
      );
    }
    if (result.status === null) {
      throw new CommentEditorError(`Failed to launch terminal editor "${command}".`);
    }
    if (result.status !== 0) {
      throw new CommentEditorError(
        `Terminal editor "${command}" exited with status ${result.status}; ${documentLabel} was not added.`,
      );
    }

    content = normalizeCommentContent(readFileSync(contentPath, "utf8"));
  } catch (error) {
    failure =
      error instanceof CommentEditorError
        ? error
        : new CommentEditorError(
            `Unable to compose ${documentLabel} with terminal editor "${command}": ${formatError(error)}`,
          );
  }

  if (temporaryDirectory) {
    try {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    } catch (error) {
      failure ??= new CommentEditorError(
        `Unable to remove temporary ${documentLabel} file: ${formatError(error)}`,
      );
    }
  }

  if (failure) {
    throw failure;
  }

  return content;
}

function defaultSpawnEditor(command: string, args: readonly string[]): EditorProcessResult {
  const result = spawnSync(command, args, { stdio: "inherit" });
  return {
    status: result.status,
    signal: result.signal,
    error: result.error,
  };
}

function parseEditorCommand(value: string): readonly string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }

  if (escaped) {
    current += "\\";
  }
  if (quote) {
    throw new CommentEditorError(`Invalid terminal editor configuration: unmatched ${quote}.`);
  }
  if (current) {
    parts.push(current);
  }

  return parts;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
