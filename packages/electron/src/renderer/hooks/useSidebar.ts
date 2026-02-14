import { useCallback, useEffect, useRef, useState } from "react";

export type SidebarMode = "expanded" | "collapsed" | "hidden";

export const SIDEBAR_DEFAULTS = {
  width: 200,
  minWidth: 140,
  maxWidth: 400,
  collapsedWidth: 48,
} as const;

const STORAGE_KEY = "todu-sidebar";

interface SidebarState {
  width: number;
  mode: SidebarMode;
}

function loadState(): SidebarState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SidebarState>;
      return {
        width:
          typeof parsed.width === "number" &&
          parsed.width >= SIDEBAR_DEFAULTS.minWidth &&
          parsed.width <= SIDEBAR_DEFAULTS.maxWidth
            ? parsed.width
            : SIDEBAR_DEFAULTS.width,
        mode:
          parsed.mode === "expanded" || parsed.mode === "collapsed" || parsed.mode === "hidden"
            ? parsed.mode
            : "expanded",
      };
    }
  } catch {
    // ignore
  }
  return { width: SIDEBAR_DEFAULTS.width, mode: "expanded" };
}

function saveState(state: SidebarState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export interface UseSidebarResult {
  width: number;
  mode: SidebarMode;
  cssWidth: number;
  setWidth: (w: number) => void;
  toggleCollapse: () => void;
  toggleHidden: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}

export function useSidebar(): UseSidebarResult {
  const [state, setState] = useState<SidebarState>(loadState);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Persist on change
  useEffect(() => {
    saveState(state);
  }, [state]);

  const setWidth = useCallback((w: number) => {
    const clamped = Math.max(SIDEBAR_DEFAULTS.minWidth, Math.min(SIDEBAR_DEFAULTS.maxWidth, w));
    setState((prev) => ({ ...prev, width: clamped, mode: "expanded" }));
  }, []);

  const toggleCollapse = useCallback(() => {
    setState((prev) => ({
      ...prev,
      mode: prev.mode === "collapsed" ? "expanded" : "collapsed",
    }));
  }, []);

  const toggleHidden = useCallback(() => {
    setState((prev) => ({
      ...prev,
      mode: prev.mode === "hidden" ? "expanded" : "hidden",
    }));
  }, []);

  // Drag-to-resize handlers
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartWidth.current = state.width;

      const onMouseMove = (ev: MouseEvent): void => {
        if (!isDragging.current) return;
        const delta = ev.clientX - dragStartX.current;
        const newWidth = dragStartWidth.current + delta;

        // Snap to collapsed if dragged below minimum
        if (newWidth < SIDEBAR_DEFAULTS.minWidth - 20) {
          setState((prev) => ({ ...prev, mode: "collapsed" }));
        } else {
          const clamped = Math.max(
            SIDEBAR_DEFAULTS.minWidth,
            Math.min(SIDEBAR_DEFAULTS.maxWidth, newWidth),
          );
          setState((prev) => ({ ...prev, width: clamped, mode: "expanded" }));
        }
      };

      const onMouseUp = (): void => {
        isDragging.current = false;
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

  const cssWidth =
    state.mode === "hidden"
      ? 0
      : state.mode === "collapsed"
        ? SIDEBAR_DEFAULTS.collapsedWidth
        : state.width;

  return {
    width: state.width,
    mode: state.mode,
    cssWidth,
    setWidth,
    toggleCollapse,
    toggleHidden,
    onDragStart,
  };
}
