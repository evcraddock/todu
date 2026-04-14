import type { Actor, ImportedContentApproval } from "@todu/core/browser";

export function createActorMap(actors?: Actor[]): Map<string, Actor> {
  return new Map((actors ?? []).map((actor) => [actor.id, actor]));
}

export function getActorName(
  actorId: string | undefined,
  actorMap: Map<string, Actor>,
  fallback?: string,
): string {
  if (!actorId) {
    return fallback ?? "Unknown";
  }

  const actor = actorMap.get(actorId);
  if (!actor) {
    return fallback ?? actorId;
  }

  return `${actor.displayName}${actor.archived ? " (archived)" : ""}`;
}

export function getActorNames(
  actorIds: readonly string[],
  actorMap: Map<string, Actor>,
  fallbackNames: readonly string[] = [],
): string[] {
  if (actorIds.length > 0) {
    return actorIds.map((actorId) => getActorName(actorId, actorMap));
  }

  return [...fallbackNames];
}

export function getApprovalLabel(approval?: ImportedContentApproval): string | null {
  if (!approval || approval.state === "notRequired") {
    return null;
  }

  return approval.state === "pendingApproval" ? "Approval needed" : "Approved import";
}
