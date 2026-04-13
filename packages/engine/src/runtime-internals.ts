import type { DocHandle } from "@automerge/automerge-repo/slim";
import { type Actor, type ActorId, type CatalogDocument, ok, type Result } from "@todu/core";
import type { SyncRuntimeActorTools } from "./todu.js";

function cloneActor(actor: Actor): Actor {
  return {
    id: actor.id,
    displayName: actor.displayName,
    ...(actor.archived !== undefined ? { archived: actor.archived } : {}),
  };
}

export function createSyncRuntimeActorTools(
  catalog: DocHandle<CatalogDocument>,
): SyncRuntimeActorTools {
  return {
    async list(): Promise<Result<Actor[]>> {
      return ok((catalog.doc()?.actors ?? []).map(cloneActor));
    },

    async getOwnerActorId(): Promise<Result<ActorId | undefined>> {
      return ok(catalog.doc()?.ownerActorId);
    },

    async ensure(input: { id: ActorId; displayName: string }): Promise<Result<Actor>> {
      const normalizedDisplayName = input.displayName.trim() || String(input.id);
      const existing = catalog.doc()?.actors.find((actor) => actor.id === input.id);
      if (existing) {
        return ok(cloneActor(existing));
      }

      const nextActor: Actor = {
        id: input.id,
        displayName: normalizedDisplayName,
      };

      catalog.change((doc) => {
        const alreadyPresent = doc.actors.some((actor) => actor.id === input.id);
        if (!alreadyPresent) {
          doc.actors.push(nextActor);
        }
      });

      const created = catalog.doc()?.actors.find((actor) => actor.id === input.id) ?? nextActor;
      return ok(cloneActor(created));
    },
  };
}
