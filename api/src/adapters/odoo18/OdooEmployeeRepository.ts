// adapters/odoo18/OdooEmployeeRepository.ts
// Implémente le port EmployeeRepository via Odoo 18 JSON-RPC.
// Le transport est choisi par viewer (compte partagé par rôle, ou session Odoo de
// l'utilisateur) — Odoo applique les droits réels du compte utilisé. fields_get
// détermine, avant tout read(), quels champs sont sûrs à demander ; has_access
// dit si CETTE fiche est modifiable par ce compte.

import type { EmployeeRepository } from "../../domain/EmployeeRepository.js";
import { DomainError } from "../../domain/errors.js";
import { applyEditableIf, editableKeys } from "../../domain/visibility.js";
import { DOMAIN_KEY_TO_ODOO_FIELD } from "./mapping.js";

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

import { recordAccess } from "./capabilities.js";
import { getFieldAccess } from "./permissions.js";
import type { OdooTransport, OdooTransportFactory } from "./transport.js";
import {
  EMPLOYEE_FIELDS_LISTING,
  EMPLOYEE_FIELDS_FULL,
  mapSummary,
  mapFormRecord,
} from "./mapping.js";
import type { OdooRawEmployee } from "./mapping.js";

interface OdooRawDepartment {
  id: number;
  name: string;
  parent_id: [number, string] | false;
  child_ids: number[];
  member_ids: number[];
}

export class OdooEmployeeRepository implements EmployeeRepository {
  constructor(private readonly transports: OdooTransportFactory) {}

  private clientFor(viewer: ViewerContext): OdooTransport {
    return this.transports.for(viewer);
  }

  async listEmployees(
    params: EmployeeListParams,
    viewer: ViewerContext
  ): Promise<EmployeeListResult> {
    const client = this.clientFor(viewer);
    const domain: unknown[] = [["active", "=", true]];

    // Mode partagé UNIQUEMENT : ce filtre refait côté API un droit qu'Odoo devrait
    // appliquer, parce que les règles d'Odoo voient le compte « manager », pas le
    // vrai manager. En identité réelle (odoo-session), Odoo filtre seul (T-33).
    if (this.transports.mode === "shared" && (viewer.role === "employee" || viewer.role === "manager")) {
      if (viewer.departmentId !== undefined) {
        domain.push(["department_id", "=", viewer.departmentId]);
      }
    }
    if (params.departmentId !== undefined) {
      domain.push(["department_id", "=", params.departmentId]);
    }
    if (params.search) {
      domain.push(
        "|", "|",
        ["name", "ilike", params.search],
        ["job_title", "ilike", params.search],
        ["work_email", "ilike", params.search]
      );
    }

    const limit = params.limit ?? 200;
    const offset = params.offset ?? 0;

    const total = await client.callKw<number>({
      model: "hr.employee",
      method: "search_count",
      args: [domain],
      kwargs: {},
    });

    const rawList = await client.callKw<OdooRawEmployee[]>({
      model: "hr.employee",
      method: "search_read",
      args: [domain],
      kwargs: {
        fields: [...EMPLOYEE_FIELDS_LISTING],
        limit,
        offset,
        order: "name asc",
      },
    });

    return EmployeeListResultSchema.parse({ items: rawList.map(mapSummary), total });
  }

  async getEmployeeById(
    id: number,
    viewer: ViewerContext
  ): Promise<EmployeeFormRecord | null> {
    const client = this.clientFor(viewer);

    // 1. Déterminer les champs lisibles/éditables AVANT de lire des données —
    //    évite toute AccessError si certains champs candidats sont interdits
    //    pour ce compte (ex. employee lisant la fiche d'un collègue).
    const access = await getFieldAccess(client, EMPLOYEE_FIELDS_FULL);

    // 2. Lire uniquement les champs autorisés ; en parallèle, demander si la fiche
    //    est modifiable (droits du modèle + règles d'enregistrement).
    const readableFields = Array.from(access.readable);
    const [rawList, writable] = await Promise.all([
      client.callKw<OdooRawEmployee[]>({
        model: "hr.employee",
        method: "read",
        args: [[id]],
        kwargs: { fields: readableFields },
      }),
      recordAccess(client, "hr.employee", [id], "write").catch((error: unknown) => {
        // Fiche inexistante : read() renvoie [] ou MissingError, on laisse read() trancher.
        if (error instanceof DomainError && error.code === "not_found") return new Map<number, boolean>();
        throw error;
      }),
    ]);

    const raw = rawList[0];
    if (!raw) return null;

    // 3. Subordonnés directs pour l'organigramme — champs publics uniquement,
    //    supposés toujours lisibles (nom, photo, poste).
    let subordinates: OdooRawEmployee[] = [];
    const childIds = raw.child_ids ?? [];
    if (childIds.length > 0) {
      subordinates = await client.callKw<OdooRawEmployee[]>({
        model: "hr.employee",
        method: "read",
        args: [childIds],
        kwargs: { fields: ["id", "name", "job_title", "image_128"] },
      });
    }

    const record = mapFormRecord(raw, [raw, ...subordinates], access, writable.get(id) === true);
    return EmployeeFormRecordSchema.parse({ ...record, formTree: applyEditableIf(record.formTree, viewer, id) });
  }

  async getDepartmentsTree(viewer: ViewerContext): Promise<DepartmentNode[]> {
    const client = this.clientFor(viewer);

    const rawDepts = await client.callKw<OdooRawDepartment[]>({
      model: "hr.department",
      method: "search_read",
      args: [[["active", "=", true]]],
      kwargs: {
        fields: ["id", "name", "parent_id", "child_ids", "member_ids"],
        order: "name asc",
      },
    });

    const map = new Map<number, DepartmentNode>();
    for (const d of rawDepts) {
      map.set(d.id, { id: d.id, name: d.name, children: [], memberIds: d.member_ids });
    }

    const roots: DepartmentNode[] = [];
    for (const d of rawDepts) {
      const node = map.get(d.id);
      if (!node) continue;
      if (d.parent_id === false) {
        roots.push(node);
      } else {
        const parent = map.get(d.parent_id[0]);
        if (parent) parent.children.push(node);
        else roots.push(node);
      }
    }

    return DepartmentNodeSchema.array().parse(roots);
  }

  async updateEmployee(
    id: number,
    patch: Record<string, unknown>,
    viewer: ViewerContext
  ): Promise<EmployeeFormRecord> {
    const client = this.clientFor(viewer);

    const odooPatch: Record<string, unknown> = {};
    for (const [domainKey, value] of Object.entries(patch)) {
      const odooField = DOMAIN_KEY_TO_ODOO_FIELD[domainKey];
      if (!odooField) {
        throw new DomainError(`Champ inconnu : ${domainKey}`, "invalid");
      }
      odooPatch[odooField] = value;
    }

    // F-05 : exactement la règle de l'affichage. On réévalue la fiche telle que
    // ce viewer la verrait (fields_get ∧ has_access ∧ editableIf) et on refuse
    // AVANT d'appeler write : message clair plutôt qu'une AccessError brute.
    if (Object.keys(odooPatch).length > 0) {
      const current = await this.getEmployeeById(id, viewer);
      if (!current) throw new DomainError(`Employé ${id} introuvable.`, "not_found");
      const editable = editableKeys(current.formTree);
      const refused = Object.keys(patch).filter((key) => !editable.has(key));
      if (refused.length > 0) {
        throw new DomainError(`Champ non modifiable pour ce profil : ${refused.join(", ")}`, "forbidden");
      }
    }

    if (Object.keys(odooPatch).length > 0) {
      await client.callKw({
        model: "hr.employee",
        method: "write",
        args: [[id], odooPatch],
        kwargs: {},
      });
    }

    const updated = await this.getEmployeeById(id, viewer);
    if (!updated) throw new DomainError(`Employé ${id} introuvable après mise à jour.`, "not_found");
    return updated;
  }
}
