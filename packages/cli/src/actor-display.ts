import type { Actor, ImportedContentApproval } from "@todu/core";
import type { CliDaemonInvoker } from "./daemon-command-client.js";

export interface ActorDisplayInfo {
  id: string;
  displayName: string;
  archived: boolean;
  authorized: boolean;
  known: boolean;
}

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

export function resolveActorDisplayInfo(
  actorId: string,
  actorMap: Record<string, Actor>,
  options: { authorizedActorIds?: readonly string[] } = {},
): ActorDisplayInfo {
  const actor = actorMap[actorId];
  const authorized =
    options.authorizedActorIds === undefined || options.authorizedActorIds.includes(actorId);

  return {
    id: actorId,
    displayName: actor?.displayName ?? actorId,
    archived: actor?.archived ?? false,
    authorized,
    known: actor !== undefined,
  };
}

function formatActorStatusSuffix(
  info: ActorDisplayInfo,
  options: { includeIds?: boolean } = {},
): string {
  const details: string[] = [];

  if (options.includeIds) {
    details.push(info.id);
  }
  if (info.archived) {
    details.push("archived");
  }
  if (!info.authorized) {
    details.push("unauthorized");
  }
  if (!info.known) {
    details.push("unknown");
  }

  return details.length > 0 ? ` (${details.join(", ")})` : "";
}

export function formatActorIdentity(
  actorId: string,
  actorMap: Record<string, Actor>,
  options: { authorizedActorIds?: readonly string[] } = {},
): string {
  const info = resolveActorDisplayInfo(actorId, actorMap, options);
  return `${info.displayName}${formatActorStatusSuffix(info, { includeIds: true })}`;
}

export function formatActorDisplay(
  actorId: string | undefined,
  actorMap: Record<string, Actor>,
  fallback?: string,
  options: { authorizedActorIds?: readonly string[] } = {},
): string {
  if (!actorId) {
    return fallback ?? "(none)";
  }

  const info = resolveActorDisplayInfo(actorId, actorMap, options);
  if (!info.known && fallback) {
    return fallback;
  }

  return `${info.displayName}${formatActorStatusSuffix(info)}`;
}

export function formatActorList(
  actorIds: readonly string[],
  actorMap: Record<string, Actor>,
  fallbackNames: readonly string[] = [],
  options: { includeIds?: boolean; authorizedActorIds?: readonly string[] } = {},
): string {
  if (actorIds.length > 0) {
    return actorIds
      .map((actorId) =>
        options.includeIds
          ? formatActorIdentity(actorId, actorMap, {
              authorizedActorIds: options.authorizedActorIds,
            })
          : formatActorDisplay(actorId, actorMap, undefined, {
              authorizedActorIds: options.authorizedActorIds,
            }),
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
