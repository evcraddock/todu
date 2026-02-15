import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// ============================================================================
// Types — mirror the AgentEvent shape from pi-agent-core
// These come serialized over IPC, so we define minimal interfaces here.
// ============================================================================

interface AgentEventAgentStart {
  type: "agent_start";
}

interface AgentEventAgentEnd {
  type: "agent_end";
}

interface AgentEventMessageStart {
  type: "message_start";
  message: ChatMessage;
}

interface AgentEventMessageUpdate {
  type: "message_update";
  message: ChatMessage;
}

interface AgentEventMessageEnd {
  type: "message_end";
  message: ChatMessage;
}

interface AgentEventToolStart {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface AgentEventToolEnd {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}

type AgentEvent =
  | AgentEventAgentStart
  | AgentEventAgentEnd
  | AgentEventMessageStart
  | AgentEventMessageUpdate
  | AgentEventMessageEnd
  | AgentEventToolStart
  | AgentEventToolEnd
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "tool_execution_update" }
  | { type: "messages_cleared" };

// Simplified message shape from the LLM
interface ChatMessage {
  role: "user" | "assistant" | "toolResult";
  content: ContentBlock[];
  errorMessage?: string;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "thinking"; thinking: string };

// ============================================================================
// Display items — what we render in the message list
// ============================================================================

interface UserItem {
  kind: "user";
  text: string;
}

interface AssistantItem {
  kind: "assistant";
  text: string;
  isStreaming: boolean;
  isError: boolean;
}

interface ToolCallItem {
  kind: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "error";
  result?: string;
}

type DisplayItem = UserItem | AssistantItem | ToolCallItem;

// ============================================================================
// Component
// ============================================================================

interface AgentViewProps {
  onClose?: () => void;
}

export function AgentView({ onClose }: AgentViewProps): ReactNode {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom — call after state updates
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  // Subscribe to agent events
  useEffect(() => {
    const cleanup = window.todu.on("todu:agent:event", (data) => {
      const event = data as AgentEvent;

      switch (event.type) {
        case "messages_cleared":
          setItems([]);
          setSendError(null);
          setIsStreaming(false);
          break;

        case "agent_start":
          setIsStreaming(true);
          setSendError(null);
          break;

        case "agent_end":
          setIsStreaming(false);
          break;

        case "message_start": {
          const msg = event.message;
          if (msg.role === "assistant") {
            const text = extractText(msg.content) ?? "";
            setItems((prev) => [
              ...prev,
              { kind: "assistant", text, isStreaming: true, isError: false },
            ]);
            scrollToBottom();
          }
          break;
        }

        case "message_update": {
          const msg = event.message;
          if (msg.role === "assistant") {
            const text = extractText(msg.content) ?? "";
            setItems((prev) => {
              const updated = [...prev];
              const lastAssistant = findLastAssistant(updated);
              if (lastAssistant >= 0) {
                updated[lastAssistant] = {
                  ...updated[lastAssistant],
                  text,
                } as AssistantItem;
              } else {
                updated.push({ kind: "assistant", text, isStreaming: true, isError: false });
              }
              return updated;
            });
            scrollToBottom();
          }
          break;
        }

        case "message_end": {
          const msg = event.message;
          if (msg.role === "assistant") {
            const text = extractText(msg.content) ?? "";
            const isError = !!msg.errorMessage;
            setItems((prev) => {
              const updated = [...prev];
              const lastAssistant = findLastAssistant(updated);
              if (lastAssistant >= 0) {
                const finalText = isError ? (msg.errorMessage ?? "Unknown error") : text;
                if (!finalText && !isError) {
                  // Empty non-error message (tool-call-only turn) — remove the placeholder
                  updated.splice(lastAssistant, 1);
                } else {
                  updated[lastAssistant] = {
                    kind: "assistant",
                    text: finalText,
                    isStreaming: false,
                    isError,
                  };
                }
              } else if (isError) {
                updated.push({
                  kind: "assistant",
                  text: msg.errorMessage ?? "Unknown error",
                  isStreaming: false,
                  isError: true,
                });
              } else if (text) {
                // Text response without a prior message_start
                updated.push({
                  kind: "assistant",
                  text,
                  isStreaming: false,
                  isError: false,
                });
              }
              return updated;
            });
          }
          break;
        }

        case "tool_execution_start":
          setItems((prev) => [
            ...prev,
            {
              kind: "tool-call",
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
              status: "running",
            },
          ]);
          scrollToBottom();
          break;

        case "tool_execution_end":
          setItems((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex(
              (i) => i.kind === "tool-call" && i.toolCallId === event.toolCallId,
            );
            if (idx >= 0) {
              updated[idx] = {
                ...(updated[idx] as ToolCallItem),
                status: event.isError ? "error" : "done",
                result: summarizeResult(event.result),
              };
            }
            return updated;
          });
          break;
      }
    });

    return cleanup;
  }, [scrollToBottom]);

  // Send message
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    setInputValue("");
    setSendError(null);

    // Add user message to display
    setItems((prev) => [...prev, { kind: "user", text }]);
    scrollToBottom();

    try {
      await window.todu.agent.send(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSendError(msg);
    }
  }, [inputValue, isStreaming, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      handleSend();
    },
    [handleSend],
  );

  const handleAbort = useCallback(() => {
    window.todu.agent.abort();
  }, []);

  const handleClear = useCallback(() => {
    window.todu.agent.clear();
    setItems([]);
    setSendError(null);
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isEmpty = items.length === 0 && !isStreaming;

  return (
    <div className="agent-view">
      <div className="agent-header">
        <h2 className="view-title">Agent</h2>
        <div className="agent-header-actions">
          {items.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleClear}>
              Clear
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="btn-icon agent-close-btn"
              onClick={onClose}
              title="Close agent pane (⌘J)"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="agent-messages">
        {isEmpty && (
          <div className="agent-empty">
            <p className="agent-empty-icon">💬</p>
            <p className="agent-empty-text">Ask me about your tasks, projects, or habits</p>
            <p className="agent-empty-hint">
              Try: &quot;What are my high priority tasks?&quot; or &quot;Create a task to review
              PRs&quot;
            </p>
          </div>
        )}

        {items.map((item, i) => {
          const key = `${item.kind}-${i}`;
          switch (item.kind) {
            case "user":
              return <UserBubble key={key} text={item.text} />;
            case "assistant":
              return (
                <AssistantBubble
                  key={key}
                  text={item.text}
                  isStreaming={item.isStreaming}
                  isError={item.isError}
                />
              );
            case "tool-call":
              return (
                <ToolCallCard
                  key={key}
                  toolName={item.toolName}
                  args={item.args}
                  status={item.status}
                  result={item.result}
                />
              );
          }
        })}

        <div ref={messagesEndRef} />
      </div>

      {sendError && <div className="agent-send-error">{sendError}</div>}

      <form className="agent-input-bar" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="agent-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button type="button" className="btn btn-danger btn-sm" onClick={handleAbort}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn btn-primary btn-sm" disabled={!inputValue.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function UserBubble({ text }: { text: string }): ReactNode {
  return (
    <div className="agent-msg agent-msg-user">
      <div className="agent-bubble agent-bubble-user">{text}</div>
    </div>
  );
}

function AssistantBubble({
  text,
  isStreaming,
  isError,
}: { text: string; isStreaming: boolean; isError: boolean }): ReactNode {
  return (
    <div className="agent-msg agent-msg-assistant">
      <div className={`agent-bubble agent-bubble-assistant ${isError ? "agent-bubble-error" : ""}`}>
        {text || (isStreaming ? "..." : "")}
        {isStreaming && <span className="agent-cursor" />}
      </div>
    </div>
  );
}

function ToolCallCard({
  toolName,
  args,
  status,
  result,
}: {
  toolName: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "error";
  result?: string;
}): ReactNode {
  const icon = status === "running" ? "⏳" : status === "error" ? "❌" : "✅";
  const label = formatToolName(toolName);
  const argsPreview = formatArgs(args);

  return (
    <div className="agent-tool-card">
      <div className="agent-tool-header">
        <span className="agent-tool-icon">{icon}</span>
        <span className="agent-tool-label">{status === "running" ? `${label}...` : label}</span>
      </div>
      {argsPreview && <div className="agent-tool-args">{argsPreview}</div>}
      {result && (
        <div className={`agent-tool-result ${status === "error" ? "agent-tool-result-error" : ""}`}>
          {result}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract text content from a message's content blocks. */
function extractText(content: ContentBlock[]): string | undefined {
  const texts = content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text);
  return texts.length > 0 ? texts.join("") : undefined;
}

/** Find the index of the last assistant item. */
function findLastAssistant(items: DisplayItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === "assistant") return i;
  }
  return -1;
}

/** Format a tool name for display (e.g., "create_task" → "Create Task"). */
function formatToolName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Format tool args as a short preview string. */
function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).filter(([_, v]) => v !== undefined);
  if (entries.length === 0) return "";
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
}

/** Summarize a tool result for display. */
function summarizeResult(result: unknown): string {
  if (result === null || result === undefined) return "";
  if (typeof result === "string") return result.slice(0, 200);

  // AgentToolResult shape: { content: [{type: "text", text: "..."}], details: {} }
  const r = result as { content?: Array<{ type: string; text?: string }>; details?: unknown };
  if (r.content && Array.isArray(r.content)) {
    const text = r.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("");
    if (text) {
      // Try to parse as JSON and provide a shorter summary
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return `${parsed.length} result${parsed.length !== 1 ? "s" : ""}`;
        }
        if (parsed.title) return parsed.title;
        if (parsed.name) return parsed.name;
        if (parsed.id) return `ID: ${parsed.id}`;
      } catch {
        // Not JSON, use raw text
      }
      return text.slice(0, 200);
    }
  }

  return JSON.stringify(result).slice(0, 200);
}
