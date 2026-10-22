// routes/ui.ts — Moteur de présentation : /api/ui/v1 (ADR-001 § 6).
// Toutes les routes exigent une session ; toutes les entrées sont validées par
// les schémas du package partagé ; aucune ne permet d'appeler une méthode libre.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CommandRequestSchema, QueryRequestSchema, WritePatchSchema } from "@leila/ui-schema";
import type { UiPorts } from "../domain/ui/ports.js";
import type { ViewerResolver } from "./viewer.js";

const Key = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const Params = {
  action: z.object({ actionKey: Key }),
  view: z.object({ viewKey: Key }),
  resource: z.object({ resourceKey: Key }),
  record: z.object({ resourceKey: Key, id: z.coerce.number().int().positive() }),
  field: z.object({ resourceKey: Key, field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/) }),
  command: z.object({ commandKey: Key }),
};

export function registerUiRoutes(fastify: FastifyInstance, ui: UiPorts, viewerOf: ViewerResolver): void {
  const prefix = "/api/ui/v1";

  fastify.get(`${prefix}/navigation`, async (request) => ui.views.navigation(viewerOf(request)));

  fastify.get(`${prefix}/actions/:actionKey`, async (request) => {
    const viewer = viewerOf(request);
    return ui.views.action(Params.action.parse(request.params).actionKey, viewer);
  });

  fastify.get(`${prefix}/views/:viewKey`, async (request) => {
    const viewer = viewerOf(request);
    return ui.views.view(Params.view.parse(request.params).viewKey, viewer);
  });

  fastify.post(`${prefix}/resources/:resourceKey/query`, async (request) => {
    const viewer = viewerOf(request);
    const { resourceKey } = Params.resource.parse(request.params);
    return ui.records.query(resourceKey, QueryRequestSchema.parse(request.body ?? {}), viewer);
  });

  fastify.get(`${prefix}/resources/:resourceKey/records/:id`, async (request) => {
    const viewer = viewerOf(request);
    const { resourceKey, id } = Params.record.parse(request.params);
    return ui.records.read(resourceKey, id, viewer);
  });

  fastify.patch(`${prefix}/resources/:resourceKey/records/:id`, async (request) => {
    const viewer = viewerOf(request);
    const { resourceKey, id } = Params.record.parse(request.params);
    return ui.records.write(resourceKey, id, WritePatchSchema.parse(request.body ?? {}), viewer);
  });

  fastify.get(`${prefix}/resources/:resourceKey/fields/:field/options`, async (request) => {
    const viewer = viewerOf(request);
    const { resourceKey, field } = Params.field.parse(request.params);
    const q = z.object({ q: z.string().max(100).default(""), recordId: z.coerce.number().int().positive().optional() }).parse(request.query);
    return ui.records.lookup(resourceKey, field, { search: q.q, recordId: q.recordId }, viewer);
  });

  fastify.post(`${prefix}/commands/:commandKey`, async (request) => {
    const viewer = viewerOf(request);
    const { commandKey } = Params.command.parse(request.params);
    return ui.commands.execute(commandKey, CommandRequestSchema.parse(request.body ?? {}), viewer);
  });

  fastify.post(`${prefix}/cache/refresh`, async (request) => ui.views.refreshCache(viewerOf(request)));
}
