export const appRoutes = ["home", "habits", "tasks", "projects", "data-status", "help"] as const;

export type AppRoute = (typeof appRoutes)[number];
export type PrimaryAppRoute = Exclude<AppRoute, "help">;

export const defaultRoute: PrimaryAppRoute = "home";

export const routeLabels: Record<AppRoute, string> = {
  tasks: "Tasks",
  projects: "Projects",
  home: "Home",
  habits: "Habits",
  "data-status": "Data Status",
  help: "Help",
};

export function isPrimaryRoute(route: AppRoute): route is PrimaryAppRoute {
  return route !== "help";
}
