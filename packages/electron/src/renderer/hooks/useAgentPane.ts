import { useCallback, useEffect, useRef, useState } from "react";

export const AGENT_PANE_DEFAULTS = {
  width: 380,
  minWidth: 280,
  maxWidth: 600,
} as const;

const STORAGE_KEY = "todu-agent-pane";

export interface AgentPaneState {
  width: number;
  visible: boolean;
}

export function loadAgentPaneState(): AgentPaneState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AgentPaneState>;
      return {
        width:
          typeof parsed.width === "number" &&
          parsed.width >= AGENT_PANE_DEFAULTS.minWidth &&
          parsed.width <= AGENT_PANE_DEFAULTS.maxWidth
            ? parsed.width
            : AGENT_PANE_DEFAULTS.width,
        visible: typeof parsed.visible === "boolean" ? parsed.visible : false,
      };
    }
  } catch {
    // ignore
  }
  return { width: AGENT_PANE_DEFAULTS.width, visible: false };
}

function saveState(state: AgentPaneState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export interface UseAgentPaneResult {
  width: number;
  visible: boolean;
  isDragging: boolean;
  cssWidth: number;
  toggle: () => void;
  show: () => void;
  hide: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}

export function useAgentPane(): UseAgentPaneResult {
  const [state, setState] = useState<AgentPaneState>(loadAgentPaneState);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Persist on change
  useEffect(() => {
    saveState(state);
  }, [state]);

  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, visible: !prev.visible }));
  }, []);

  const show = useCallback(() => {
    setState((prev) => ({ ...prev, visible: true }));
  }, []);

  const hide = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  // Drag-to-resize — handle is on the LEFT edge of the pane,
  // so dragging left increases width, dragging right decreases it.
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      setIsDragging(true);
      dragStartX.current = e.clientX;
      dragStartWidth.current = state.width;

      const onMouseMove = (ev: MouseEvent): void => {
        if (!isDraggingRef.current) return;
        // Dragging left (negative delta) → wider pane
        const delta = dragStartX.current - ev.clientX;
        const newWidth = dragStartWidth.current + delta;
        const clamped = Math.max(
          AGENT_PANE_DEFAULTS.minWidth,
          Math.min(AGENT_PANE_DEFAULTS.maxWidth, newWidth),
        );
        setState((prev) => ({ ...prev, width: clamped }));
      };

      const onMouseUp = (): void => {
        isDraggingRef.current = false;
        setIsDragging(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [state.width],
  );

  const cssWidth = state.visible ? state.width : 0;

  return {
    width: state.width,
    visible: state.visible,
    isDragging,
    cssWidth,
    toggle,
    show,
    hide,
    onDragStart,
  };
}
