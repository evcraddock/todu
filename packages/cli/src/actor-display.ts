import type { Actor, ImportedContentApproval } from "@todu/core";
import type { CliDaemonInvoker } from "./daemon-command-client.js";

export async function buildActorMap(
  invokeDaemon: CliDaemonInvoker,
): Promise<Record<string, Actor>> {
  const result = await invokeDaemon<Actor[]>("actor.list", {});
  if (!result.ok) {
    return {};
  }

  const map: Record<string, Actor> = {};
  for (const actor of result.value) {
    map[actor.id] = actor;
  }
  return map;
}

export function formatActorIdentity(actorId: string, actorMap: Record<string, Actor>): string {
  const actor = actorMap[actorId];
  if (!actor) {
    return actorId;
  }

  const archivedSuffix = actor.archived ? " (archived)" : "";
  return `${actor.displayName}${archivedSuffix} (${actor.id})`;
}

export function formatActorDisplay(
  actorId: string | undefined,
  actorMap: Record<string, Actor>,
  fallback?: string,
): string {
  if (!actorId) {
    return fallback ?? "(none)";
  }

  const actor = actorMap[actorId];
  if (!actor) {
    return fallback ?? actorId;
  }

  return `${actor.displayName}${actor.archived ? " (archived)" : ""}`;
}

export function formatActorList(
  actorIds: readonly string[],
  actorMap: Record<string, Actor>,
  fallbackNames: readonly string[] = [],
  options: { includeIds?: boolean } = {},
): string {
  if (actorIds.length > 0) {
    return actorIds
      .map((actorId) =>
        options.includeIds
          ? formatActorIdentity(actorId, actorMap)
          : formatActorDisplay(actorId, actorMap),
      )
      .join(", ");
  }

  if (fallbackNames.length > 0) {
    return fallbackNames.join(", ");
  }

  return "(none)";
}

export function formatApprovalSummary(approval?: ImportedContentApproval): string | null {
  if (!approval || approval.state === "notRequired") {
    return null;
  }

  return approval.state === "pendingApproval" ? "approval needed" : "approved";
}
