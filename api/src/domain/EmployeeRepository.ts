// domain/EmployeeRepository.ts — Port (interface abstraite)
// Aucun terme Odoo dans ce fichier.

import type {
  EmployeeFormRecord,
  EmployeeListResult,
  EmployeeListParams,
  DepartmentNode,
  ViewerContext,
} from "./tree.js";

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented in this adapter`);
    this.name = "NotImplementedError";
  }
}

export interface EmployeeRepository {
  listEmployees(params: EmployeeListParams, viewer: ViewerContext): Promise<EmployeeListResult>;
  getEmployeeById(id: number, viewer: ViewerContext): Promise<EmployeeFormRecord | null>;
  getDepartmentsTree(viewer: ViewerContext): Promise<DepartmentNode[]>;
  updateEmployee(id: number, patch: Record<string, unknown>, viewer: ViewerContext): Promise<EmployeeFormRecord>;
}
