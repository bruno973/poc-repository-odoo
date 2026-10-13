import type { FastifyInstance } from "fastify";
import type { EmployeeRepository } from "../domain/EmployeeRepository.js";
import { extractViewer } from "./viewer.js";

export function registerDepartmentRoutes(
  fastify: FastifyInstance,
  repository: EmployeeRepository
): void {
  fastify.get("/api/departments/tree", async (request, reply) => {
    const viewer = extractViewer(request);
    const tree = await repository.getDepartmentsTree(viewer);
    return reply.send(tree);
  });
}
