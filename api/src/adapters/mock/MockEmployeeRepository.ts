// adapters/mock/MockEmployeeRepository.ts
// Implémente le port EmployeeRepository via des fixtures statiques.

import type { EmployeeRepository } from "../../domain/EmployeeRepository.js";
import { NotImplementedError } from "../../domain/EmployeeRepository.js";
import type {
  EmployeeListParams,
  EmployeeListResult,
  EmployeeFormRecord,
  DepartmentNode,
  ViewerContext,
} from "../../domain/tree.js";
import {
  EmployeeListResultSchema,
  EmployeeFormRecordSchema,
  DepartmentNodeSchema,
} from "../../domain/tree.schema.js";
import { SUMMARIES, RECORDS, DEPARTMENTS } from "./fixtures.js";
import { hydrateMockSkeleton } from "./index.js";

export class MockEmployeeRepository implements EmployeeRepository {
  async listEmployees(
    params: EmployeeListParams,
    viewer: ViewerContext
  ): Promise<EmployeeListResult> {
    let items = [...SUMMARIES];

    if (viewer.role === "employee" || viewer.role === "manager") {
      const deptId = viewer.departmentId;
      if (deptId !== undefined) {
        items = items.filter((e) => e.department?.id === deptId);
      }
    }
    if (params.departmentId !== undefined) {
      items = items.filter((e) => e.department?.id === params.departmentId);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      items = items.filter(
        (e) =>
          e.fullName.toLowerCase().includes(q) ||
          (e.jobTitle?.toLowerCase().includes(q) ?? false) ||
          (e.workEmail?.toLowerCase().includes(q) ?? false)
      );
    }

    const total = items.length;
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    items = items.slice(offset, offset + limit);

    return EmployeeListResultSchema.parse({ items, total });
  }

  async getEmployeeById(
    id: number,
    _viewer: ViewerContext
  ): Promise<EmployeeFormRecord | null> {
    const flat = RECORDS.find((r) => r.id === id);
    if (!flat) return null;

    const record: EmployeeFormRecord = {
      id: flat.id,
      headerSummary: {
        fullName: flat.header.fullName,
        jobTitle: flat.header.jobTitle,
        photo: flat.header.photo,
        department: flat.header.department,
        workEmail: flat.header.workEmail,
      },
      formTree: hydrateMockSkeleton(flat),
      orgChart: flat.orgChart,
    };

    return EmployeeFormRecordSchema.parse(record);
  }

  async getDepartmentsTree(_viewer: ViewerContext): Promise<DepartmentNode[]> {
    return DepartmentNodeSchema.array().parse(DEPARTMENTS);
  }

  async updateEmployee(
    _id: number,
    _patch: Record<string, unknown>,
    _viewer: ViewerContext
  ): Promise<EmployeeFormRecord> {
    throw new NotImplementedError("updateEmployee");
  }
}
