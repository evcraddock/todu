import { type AppRoute, defaultRoute, type PrimaryAppRoute } from "./routes.js";

export interface TuiKeyBinding {
  keys: string;
  description: string;
}

export const globalKeyBindings: readonly TuiKeyBinding[] = [
  { keys: "1", description: "Tasks" },
  { keys: "2", description: "Projects" },
  { keys: "3", description: "Data Status" },
  { keys: "?", description: "Help" },
  { keys: "q", description: "Back/Quit" },
  { keys: "j/↓", description: "Down" },
  { keys: "k/↑", description: "Up" },
  { keys: "Enter", description: "Select Project" },
  { keys: "a", description: "All Projects" },
  { keys: "Ctrl+C", description: "Quit" },
] as const;

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
