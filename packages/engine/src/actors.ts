import type { DocHandle } from "@automerge/automerge-repo/slim";
import {
  type Actor,
  type CatalogDocument,
  type CreateActorInput,
  createActorId,
  err,
  notFound,
  ok,
  type Result,
  validateActorDisplayName,
  validateCreateActorInput,
  validationError,
} from "@todu/core";
import type { ActorNamespace } from "./todu.js";

function cloneActor(actor: Actor): Actor {
  return {
    id: actor.id,
    displayName: actor.displayName,
    ...(actor.archived !== undefined ? { archived: actor.archived } : {}),
  };
}

function normalizeActorDisplayName(displayName: string): string {
  return displayName.trim();
}

export function createActorNamespace(catalog: DocHandle<CatalogDocument>): ActorNamespace {
  return {
    async list(): Promise<Result<Actor[]>> {
      return ok((catalog.doc()?.actors ?? []).map(cloneActor));
    },

    async create(input: CreateActorInput): Promise<Result<Actor>> {
      const validationErr = validateCreateActorInput(input);
      if (validationErr) return err(validationErr);

      const doc = catalog.doc();
      if (!doc) {
        return err(notFound("catalog", "default"));
      }

      const normalizedId = createActorId(input.id.trim());
      if (doc.actors.some((actor) => actor.id === normalizedId)) {
        return err(validationError("id", `Actor ID already exists: ${normalizedId}`));
      }

      const actor: Actor = {
        id: normalizedId,
        displayName: normalizeActorDisplayName(input.displayName),
      };

      catalog.change((nextDoc) => {
        nextDoc.actors.push(actor);
      });

      return ok(cloneActor(actor));
    },

    async rename(id, displayName): Promise<Result<Actor>> {
      const displayNameError = validateActorDisplayName("displayName", displayName);
      if (displayNameError) return err(displayNameError);

      const doc = catalog.doc();
      if (!doc) return err(notFound("actor", id));

      const normalizedId = createActorId(id.trim());
      const index = doc.actors.findIndex((actor) => actor.id === normalizedId);
      if (index === -1) return err(notFound("actor", normalizedId));

      const normalizedDisplayName = normalizeActorDisplayName(displayName);
      catalog.change((nextDoc) => {
        nextDoc.actors[index].displayName = normalizedDisplayName;
      });

      return ok(cloneActor(catalog.doc()!.actors[index]));
    },

    async archive(id): Promise<Result<Actor>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("actor", id));

      const normalizedId = createActorId(id.trim());
      const index = doc.actors.findIndex((actor) => actor.id === normalizedId);
      if (index === -1) return err(notFound("actor", normalizedId));

      catalog.change((nextDoc) => {
        nextDoc.actors[index].archived = true;
      });

      return ok(cloneActor(catalog.doc()!.actors[index]));
    },

    async unarchive(id): Promise<Result<Actor>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("actor", id));

      const normalizedId = createActorId(id.trim());
      const index = doc.actors.findIndex((actor) => actor.id === normalizedId);
      if (index === -1) return err(notFound("actor", normalizedId));

      catalog.change((nextDoc) => {
        delete nextDoc.actors[index].archived;
      });

      return ok(cloneActor(catalog.doc()!.actors[index]));
    },
  };
}
