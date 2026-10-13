// adapters/mock/MockEmployeeRepository.ts
// Implémente le port EmployeeRepository via des fixtures en mémoire (copie
// modifiable par instance : updateEmployee fonctionne, plus de 501).

import type { EmployeeRepository } from "../../domain/EmployeeRepository.js";
import { DomainError } from "../../domain/errors.js";
import type {
  EmployeeListParams,
  EmployeeListResult,
  EmployeeFormRecord,
  DepartmentNode,
  FormNode,
  ViewerContext,
} from "../../domain/tree.js";
import {
  EmployeeListResultSchema,
  EmployeeFormRecordSchema,
  DepartmentNodeSchema,
} from "../../domain/tree.schema.js";
import { EMPLOYEE_SKELETON } from "../../domain/employee.skeleton.js";
import { applyEditableIf, editableKeys } from "../../domain/visibility.js";
import { SUMMARIES, RECORDS, DEPARTMENTS, type MockEmployeeFlat } from "./fixtures.js";
import { hydrateMockSkeleton } from "./index.js";
import { canWriteField } from "./rights.js";

/** Feuilles du squelette indexées par clé (pour valider un patch). */
const LEAVES = new Map<string, Exclude<FormNode, { kind: "group" }>>();
const collect = (nodes: readonly FormNode[]) => {
  for (const n of nodes) {
    if (n.kind === "group") collect(n.children);
    else LEAVES.set(n.key, n);
  }
};
collect(EMPLOYEE_SKELETON);

export class MockEmployeeRepository implements EmployeeRepository {
  private readonly records: MockEmployeeFlat[] = structuredClone(RECORDS);

  get flatRecords(): readonly MockEmployeeFlat[] {
    return this.records;
  }

  async listEmployees(
    params: EmployeeListParams,
    viewer: ViewerContext
  ): Promise<EmployeeListResult> {
    let items = SUMMARIES.map((s) => this.summaryOf(s.id) ?? s);

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
    viewer: ViewerContext
  ): Promise<EmployeeFormRecord | null> {
    const flat = this.records.find((r) => r.id === id);
    if (!flat) return null;

    const tree = hydrateMockSkeleton(flat, (key) => canWriteField(viewer, id, key, this.records));
    const record: EmployeeFormRecord = {
      id: flat.id,
      headerSummary: {
        fullName: flat.header.fullName,
        jobTitle: flat.header.jobTitle,
        photo: flat.header.photo,
        department: flat.header.department,
        workEmail: flat.header.workEmail,
      },
      formTree: applyEditableIf(tree, viewer, id),
      orgChart: flat.orgChart,
    };

    return EmployeeFormRecordSchema.parse(record);
  }

  async getDepartmentsTree(_viewer: ViewerContext): Promise<DepartmentNode[]> {
    return DepartmentNodeSchema.array().parse(DEPARTMENTS);
  }

  async updateEmployee(
    id: number,
    patch: Record<string, unknown>,
    viewer: ViewerContext
  ): Promise<EmployeeFormRecord> {
    for (const key of Object.keys(patch)) {
      if (!LEAVES.has(key)) throw new DomainError(`Champ inconnu : ${key}`, "invalid");
    }
    // Même règle que l'affichage : la fiche telle que ce viewer la voit.
    const current = await this.getEmployeeById(id, viewer);
    const flat = this.records.find((r) => r.id === id);
    if (!current || !flat) throw new DomainError(`Employé ${id} introuvable.`, "not_found");
    const editable = editableKeys(current.formTree);
    const refused = Object.keys(patch).filter((key) => !editable.has(key));
    if (refused.length > 0) {
      throw new DomainError(`Champ non modifiable pour ce profil : ${refused.join(", ")}`, "forbidden");
    }

    for (const [key, value] of Object.entries(patch)) {
      const node = LEAVES.get(key);
      if (node?.kind === "select" && value !== null && !node.options.some((o) => o.value === value)) {
        throw new DomainError(`Valeur refusée pour ${key} : ${String(value)}`, "business_rule");
      }
      if (node?.kind === "text" && value !== null && typeof value !== "string" && typeof value !== "number") {
        throw new DomainError(`Valeur refusée pour ${key}.`, "invalid");
      }
      const [section, field] = key.split(".") as [string, string];
      (flat as unknown as Record<string, Record<string, unknown>>)[section]![field] = value === "" ? null : value;
    }

    const updated = await this.getEmployeeById(id, viewer);
    if (!updated) throw new DomainError(`Employé ${id} introuvable après mise à jour.`, "not_found");
    return updated;
  }

  private summaryOf(id: number) {
    const base = SUMMARIES.find((s) => s.id === id);
    const flat = this.records.find((r) => r.id === id);
    if (!base || !flat) return undefined;
    return {
      ...base,
      fullName: flat.header.fullName,
      jobTitle: flat.header.jobTitle,
      workEmail: flat.header.workEmail,
      workPhone: flat.header.workPhone,
    };
  }
}
