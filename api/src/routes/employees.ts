// routes/employees.ts
// GET   /api/employees        — listing paginé filtré
// GET   /api/employees/:id    — fiche complète (élaguée selon le viewer)
// PATCH /api/employees/:id    — mise à jour partielle

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { EmployeeRepository } from "../domain/EmployeeRepository.js";
import { DomainError } from "../domain/errors.js";
import type { EmployeeListParams } from "../domain/tree.js";
import { applyVisibility } from "../domain/visibility.js";
import { extractViewer } from "./viewer.js";

const ListQuerySchema = z.object({
  search: z.string().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const IdParamsSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * Patch envoyé par le front : { "infoPrivee.privateStreet": "12 rue X", ... }
 * Clés = mêmes clés que FormNode.key. Traduction vers Odoo : dans l'adapter.
 */
const UpdatePatchSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

export function registerEmployeeRoutes(fastify: FastifyInstance, repository: EmployeeRepository): void {
  fastify.get("/api/employees", async (request) => {
    const viewer = extractViewer(request);
    const d = ListQuerySchema.parse(request.query);
    const params: EmployeeListParams = {
      ...(d.search !== undefined && { search: d.search }),
      ...(d.departmentId !== undefined && { departmentId: d.departmentId }),
      ...(d.limit !== undefined && { limit: d.limit }),
      ...(d.offset !== undefined && { offset: d.offset }),
    };
    return repository.listEmployees(params, viewer);
  });

  fastify.get("/api/employees/:id", async (request) => {
    const viewer = extractViewer(request);
    const { id } = IdParamsSchema.parse(request.params);
    const record = await repository.getEmployeeById(id, viewer);
    if (!record) throw new DomainError(`Employé ${id} introuvable.`, "not_found");
    // Élagage serveur : les nœuds invisibles pour ce viewer ne partent pas.
    return applyVisibility(record, viewer);
  });

  fastify.patch("/api/employees/:id", async (request) => {
    const viewer = extractViewer(request);
    const { id } = IdParamsSchema.parse(request.params);
    const patch = UpdatePatchSchema.parse(request.body ?? {});
    const updated = await repository.updateEmployee(id, patch, viewer);
    return applyVisibility(updated, viewer);
  });
}
