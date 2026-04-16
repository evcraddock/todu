import type { Actor, ImportedContentApproval } from "@todu/core/browser";

export interface ActorLabelOptions {
  fallback?: string;
  includeId?: boolean;
  authorizedActorIds?: readonly string[];
}

export function createActorMap(actors?: Actor[]): Map<string, Actor> {
  return new Map((actors ?? []).map((actor) => [actor.id, actor]));
}

function actorStatusParts(
  actorId: string,
  actor: Actor | undefined,
  options: ActorLabelOptions,
): string[] {
  const parts: string[] = [];

  if (options.includeId && actor) {
    parts.push(actorId);
  }

  if (actor?.archived) {
    parts.push("archived");
  }

  if (options.authorizedActorIds && !options.authorizedActorIds.includes(actorId)) {
    parts.push("unauthorized");
  }

  return parts;
}

export function getActorName(
  actorId: string | undefined,
  actorMap: Map<string, Actor>,
  fallback?: string,
  options: Omit<ActorLabelOptions, "fallback"> = {},
): string {
  if (!actorId) {
    return fallback ?? "Unknown";
  }

  const actor = actorMap.get(actorId);
  const baseLabel = actor?.displayName ?? fallback ?? actorId;
  const statusParts = actorStatusParts(actorId, actor, options);

  if (statusParts.length === 0) {
    return baseLabel;
  }

  const uniqueStatusParts = [...new Set(statusParts)];
  return `${baseLabel} (${uniqueStatusParts.join(", ")})`;
}

export function getActorNames(
  actorIds: readonly string[],
  actorMap: Map<string, Actor>,
  fallbackNames: readonly string[] = [],
  options: Omit<ActorLabelOptions, "fallback"> = {},
): string[] {
  if (actorIds.length > 0) {
    return actorIds.map((actorId) => getActorName(actorId, actorMap, undefined, options));
  }

  return [...fallbackNames];
}

export function getApprovalLabel(approval?: ImportedContentApproval): string | null {
  if (!approval || approval.state === "notRequired") {
    return null;
  }

  return approval.state === "pendingApproval" ? "Approval needed" : "Approved import";
}
