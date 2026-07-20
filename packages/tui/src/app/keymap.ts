import { type AppRoute, defaultRoute, type PrimaryAppRoute } from "./routes.js";

export interface TuiKeyBinding {
  keys: string;
  description: string;
}

export const primaryRouteKeyBindings: readonly TuiKeyBinding[] = [
  { keys: "1", description: "Tasks" },
  { keys: "2", description: "Projects" },
  { keys: "3", description: "Data Status" },
] as const;

export const globalKeyBindings: readonly TuiKeyBinding[] = [
  { keys: "1/2/3", description: "Tasks/Projects/Data Status" },
  { keys: "?", description: "Help" },
  { keys: "q", description: "Back/Quit" },
  { keys: "j/↓", description: "Down" },
  { keys: "k/↑", description: "Up" },
  { keys: "Enter", description: "Select/Open/Submit" },
  { keys: "Esc", description: "Back/Cancel" },
  { keys: "s", description: "Start" },
  { keys: "w", description: "Wait" },
  { keys: "d", description: "Done" },
  { keys: "x", description: "Cancel" },
  { keys: "c", description: "Comment in editor" },
  { keys: "a", description: "All Projects" },
  { keys: "y/n", description: "Confirm/Cancel" },
  { keys: "Ctrl+F", description: "Filter list" },
  { keys: "Ctrl+C", description: "Quit" },
] as const;

export type TasksFooterContext =
  | "tasks-list"
  | "tasks-projects"
  | "task-detail"
  | "cancel-confirmation"
  | "filter-modal";

export type FooterContext = TasksFooterContext | "projects" | "data-status" | "help";

export const footerKeyBindings: Readonly<Record<FooterContext, readonly TuiKeyBinding[]>> = {
  "tasks-list": [
    { keys: "↑↓", description: "Select" },
    { keys: "←", description: "Projects" },
    { keys: "Enter", description: "Details" },
    { keys: "c", description: "Comment" },
    { keys: "?", description: "Help" },
    { keys: "q", description: "Quit" },
  ],
  "tasks-projects": [
    { keys: "↑↓", description: "Select" },
    { keys: "→", description: "Tasks" },
    { keys: "Enter", description: "Focus" },
    { keys: "?", description: "Help" },
    { keys: "q", description: "Quit" },
  ],
  "task-detail": [
    { keys: "↑↓", description: "Scroll" },
    { keys: "Esc", description: "Back" },
    { keys: "s", description: "Start" },
    { keys: "d", description: "Done" },
    { keys: "c", description: "Comment" },
    { keys: "?", description: "Help" },
  ],
  projects: [
    { keys: "↑↓", description: "Select" },
    { keys: "Enter", description: "Open Tasks" },
    { keys: "a", description: "All Projects" },
    { keys: "?", description: "Help" },
    { keys: "q", description: "Quit" },
  ],
  "data-status": [
    { keys: "?", description: "Help" },
    { keys: "q", description: "Quit" },
  ],
  help: [{ keys: "q", description: "Back" }],
  "cancel-confirmation": [
    { keys: "y", description: "Confirm" },
    { keys: "n/Esc", description: "Cancel" },
  ],
  "filter-modal": [
    { keys: "↑↓", description: "Select" },
    { keys: "Space", description: "Toggle" },
    { keys: "←→", description: "Priority" },
    { keys: "Enter", description: "Apply" },
    { keys: "r", description: "Reset" },
    { keys: "Esc", description: "Cancel" },
  ],
};

export type AppKeyAction =
  | { type: "navigate"; route: PrimaryAppRoute }
  | { type: "help" }
  | { type: "back-or-quit" }
  | { type: "quit" }
  | { type: "none" };

export interface AppKeyboardKey {
  ctrl?: boolean;
}

export interface RouteState {
  route: AppRoute;
  previousRoute: PrimaryAppRoute;
}

export function resolveGlobalKeyAction(input: string, key: AppKeyboardKey): AppKeyAction {
  if (key.ctrl && input === "c") {
    return { type: "quit" };
  }

  if (input === "1") {
    return { type: "navigate", route: "tasks" };
  }

  if (input === "2") {
    return { type: "navigate", route: "projects" };
  }

  if (input === "3") {
    return { type: "navigate", route: "data-status" };
  }

  if (input === "?") {
    return { type: "help" };
  }

  if (input === "q") {
    return { type: "back-or-quit" };
  }

  return { type: "none" };
}

export function applyNavigationAction(
  state: RouteState,
  action: AppKeyAction,
): RouteState | "quit" {
  if (action.type === "quit") {
    return "quit";
  }

  if (action.type === "navigate") {
    return {
      route: action.route,
      previousRoute: action.route,
    };
  }

  if (action.type === "help") {
    return {
      route: "help",
      previousRoute: state.route === "help" ? state.previousRoute : state.route,
    };
  }

  if (action.type === "back-or-quit") {
    if (state.route === "help") {
      return {
        route: state.previousRoute,
        previousRoute: state.previousRoute,
      };
    }

    return "quit";
  }

  return state;
}

export function createInitialRouteState(): RouteState {
  return {
    route: defaultRoute,
    previousRoute: defaultRoute,
  };
}
