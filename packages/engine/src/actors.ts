import type { DocHandle } from "@automerge/automerge-repo/slim";
import {
  type Actor,
  type ActorId,
  type CatalogDocument,
  type CreateActorInput,
  createActorId,
  err,
  notFound,
  ok,
  type Result,
  validateActorDisplayName,
  validateActorId,
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

function normalizeActorId(id: ActorId): ActorId {
  return createActorId(id.trim());
}

function findActor(doc: CatalogDocument | undefined, id: ActorId): Actor | undefined {
  return doc?.actors.find((actor) => actor.id === id);
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

      const normalizedId = normalizeActorId(input.id);
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

    async getOwner(): Promise<Result<Actor>> {
      const doc = catalog.doc();
      if (!doc) {
        return err(notFound("catalog", "default"));
      }

      const ownerActorId = doc.ownerActorId;
      const owner = ownerActorId ? findActor(doc, ownerActorId) : undefined;
      if (!owner) {
        return err(notFound("actor", ownerActorId ?? "owner"));
      }

      return ok(cloneActor(owner));
    },

    async setOwner(id): Promise<Result<Actor>> {
      const actorIdError = validateActorId("actorId", id);
      if (actorIdError) return err(actorIdError);

      const doc = catalog.doc();
      if (!doc) {
        return err(notFound("catalog", "default"));
      }

      const normalizedId = normalizeActorId(id);
      const owner = findActor(doc, normalizedId);
      if (!owner) {
        return err(notFound("actor", normalizedId));
      }
      if (owner.archived) {
        return err(validationError("actorId", `Archived actor cannot be owner: ${normalizedId}`));
      }

      catalog.change((nextDoc) => {
        nextDoc.ownerActorId = normalizedId;
      });

      return ok(cloneActor(owner));
    },

    async rename(id, displayName): Promise<Result<Actor>> {
      const displayNameError = validateActorDisplayName("displayName", displayName);
      if (displayNameError) return err(displayNameError);

      const doc = catalog.doc();
      if (!doc) return err(notFound("actor", id));

      const normalizedId = normalizeActorId(id);
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

      const normalizedId = normalizeActorId(id);
      const index = doc.actors.findIndex((actor) => actor.id === normalizedId);
      if (index === -1) return err(notFound("actor", normalizedId));
      if (doc.ownerActorId === normalizedId) {
        return err(validationError("id", `Owner actor cannot be archived: ${normalizedId}`));
      }

      catalog.change((nextDoc) => {
        nextDoc.actors[index].archived = true;
      });

      return ok(cloneActor(catalog.doc()!.actors[index]));
    },

    async unarchive(id): Promise<Result<Actor>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("actor", id));

      const normalizedId = normalizeActorId(id);
      const index = doc.actors.findIndex((actor) => actor.id === normalizedId);
      if (index === -1) return err(notFound("actor", normalizedId));

      catalog.change((nextDoc) => {
        delete nextDoc.actors[index].archived;
      });

      return ok(cloneActor(catalog.doc()!.actors[index]));
    },
  };
}
