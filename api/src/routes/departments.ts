import type { FastifyInstance } from "fastify";
import type { EmployeeRepository } from "../domain/EmployeeRepository.js";
import type { ViewerResolver } from "./viewer.js";

export function registerDepartmentRoutes(
  fastify: FastifyInstance,
  repository: EmployeeRepository,
  viewerOf: ViewerResolver
): void {
  fastify.get("/api/departments/tree", async (request, reply) => {
    const viewer = viewerOf(request);
    const tree = await repository.getDepartmentsTree(viewer);
    return reply.send(tree);
  });
}
