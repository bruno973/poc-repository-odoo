// adapters/mock/index.ts
// Hydrate le skeleton statique à partir du format plat MockEmployeeFlat.
// editable: true partout — simplification PoC pour le mock.

import { EMPLOYEE_SKELETON } from "../../domain/employee.skeleton.js";
import type { FormNode, GroupNode } from "../../domain/tree.js";
import type { MockEmployeeFlat } from "./fixtures.js";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current ?? null;
}

export function hydrateMockSkeleton(flat: MockEmployeeFlat): GroupNode[] {
  function hydrateNode(node: FormNode): FormNode {
    if (node.kind === "group") {
      return { ...node, children: node.children.map(hydrateNode) };
    }
    const value = getNestedValue(flat as unknown as Record<string, unknown>, node.key);
    return { ...node, value, editable: true } as FormNode;
  }
  return EMPLOYEE_SKELETON.map((g) => hydrateNode(g) as GroupNode);
}

export { MockEmployeeRepository } from "./MockEmployeeRepository.js";
export { MockTimeStore, MockAttendanceRepository, MockSummaryRepository } from "./MockTimeRepositories.js";
