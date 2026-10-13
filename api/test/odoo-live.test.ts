// test/odoo-live.test.ts — Contre une VRAIE base Odoo. Ne tourne que si
// ADAPTER=odoo et les variables d'api/.env sont définies.
// Reprend l'ancien contract.test.ts (champs présents dans fields_get), étendu
// aux modèles de pointage, puis rejoue le contrat des ports.
//
// Écritures (cycle arrivée/départ) : ODOO_TEST_EMPLOYEE_ID + ODOO_TEST_WRITES=1,
// sur une base de RECETTE uniquement.

import "dotenv/config";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { OdooClient } from "../src/adapters/odoo18/client.js";
import { ATTENDANCE_FIELDS } from "../src/adapters/odoo18/OdooAttendanceRepository.js";
import { DIMENSION_FIELDS, TOTAL_FIELDS } from "../src/adapters/odoo18/OdooSummaryRepository.js";
import { EMPLOYEE_FIELDS_FULL, EMPLOYEE_FIELDS_LISTING } from "../src/adapters/odoo18/mapping.js";
import { createRepositories } from "../src/app/repositories.js";
import { Tracer } from "../src/app/trace.js";
import { runContract } from "./contract.js";

const env = process.env;
const enabled = env["ADAPTER"] === "odoo" && Boolean(env["ODOO_URL"] && env["ODOO_USER_HR_ADMIN"]);

if (enabled) {
  describe("Odoo 18 : les champs du mapping existent (compte hr_admin)", () => {
    let client: OdooClient;
    const fieldsOf = async (model: string) =>
      new Set(
        Object.keys(
          await client.callKw<Record<string, unknown>>({ model, method: "fields_get", args: [], kwargs: { attributes: ["type"] } }),
        ),
      );

    before(async () => {
      client = new OdooClient({
        url: env["ODOO_URL"] as string,
        db: env["ODOO_DB"] as string,
        user: env["ODOO_USER_HR_ADMIN"] as string,
        password: env["ODOO_PASSWORD_HR_ADMIN"] as string,
      });
      await client.authenticate();
    });

    const check = (model: string, fields: readonly string[]) => async () => {
      const available = await fieldsOf(model);
      assert.deepEqual(fields.filter((f) => !available.has(f)), [], `champs absents de ${model}`);
    };

    it("hr.employee (listing + fiche)", check("hr.employee", [...EMPLOYEE_FIELDS_LISTING, ...EMPLOYEE_FIELDS_FULL]));
    it("hr.department", check("hr.department", ["id", "name", "parent_id", "child_ids", "member_ids"]));
    it("hr.attendance (+ leila_hr)", check("hr.attendance", ATTENDANCE_FIELDS));
    it(
      "hr.attendance.ventilation (leila_hr)",
      check("hr.attendance.ventilation", [...Object.values(DIMENSION_FIELDS), ...Object.values(TOTAL_FIELDS)]),
    );
  });

  runContract(`Odoo (${env["ODOO_DB"]})`, () => createRepositories(env, new Tracer()), {
    viewer: { id: 1, role: "hr_admin", employeeId: 1 },
    ...(env["ODOO_TEST_EMPLOYEE_ID"] ? { employeeId: Number(env["ODOO_TEST_EMPLOYEE_ID"]) } : {}),
    writes: env["ODOO_TEST_WRITES"] === "1",
  });
}
