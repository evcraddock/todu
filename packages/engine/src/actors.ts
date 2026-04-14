import type { DocHandle } from "@automerge/automerge-repo/slim";
import { type Actor, type CatalogDocument, ok, type Result } from "@todu/core";
import type { ActorNamespace } from "./todu.js";

function cloneActor(actor: Actor): Actor {
  return {
    id: actor.id,
    displayName: actor.displayName,
    ...(actor.archived !== undefined ? { archived: actor.archived } : {}),
  };
}

export function createActorNamespace(catalog: DocHandle<CatalogDocument>): ActorNamespace {
  return {
    async list(): Promise<Result<Actor[]>> {
      return ok((catalog.doc()?.actors ?? []).map(cloneActor));
    },
  };
}
