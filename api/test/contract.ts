// test/contract.ts — Contrat des ports, commun à TOUS les adapters.
// Si le mock et Odoo passent le même jeu de tests, ils sont interchangeables.

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { Repositories } from "../src/app/repositories.js";
import { DomainError } from "../src/domain/errors.js";
import type { ViewerContext } from "../src/domain/tree.js";

export interface ContractOptions {
  viewer: ViewerContext;
  /** Employé utilisé pour le cycle arrivée/départ (écritures) */
  employeeId?: number;
  writes: boolean;
}

export function runContract(name: string, make: () => Promise<Repositories>, options: ContractOptions): void {
  const { viewer } = options;

  describe(`Contrat des ports : ${name}`, () => {
    let repos: Repositories;
    before(async () => {
      repos = await make();
    });

    it("liste les employés avec un total cohérent", async () => {
      const page = await repos.employees.listEmployees({ limit: 5 }, viewer);
      assert.ok(page.items.length > 0, "aucun employé");
      assert.ok(page.items.length <= 5);
      assert.ok(page.total >= page.items.length);
    });

    it("renvoie null pour un employé introuvable", async () => {
      assert.equal(await repos.employees.getEmployeeById(987654321, viewer), null);
    });

    it("renvoie une fiche dont l'arbre est conforme au squelette", async () => {
      const first = (await repos.employees.listEmployees({ limit: 1 }, viewer)).items[0];
      assert.ok(first);
      const record = await repos.employees.getEmployeeById(first.id, viewer);
      assert.ok(record);
      assert.equal(record.id, first.id);
      assert.ok(record.formTree.length > 0);
    });

    it("pagine les pointages", async () => {
      const page = await repos.attendances.listAttendances({ limit: 5, offset: 0, onlyWithWorkedHours: true }, viewer);
      assert.ok(page.items.length <= 5);
      assert.ok(page.total >= page.items.length);
    });

    it("donne des totaux de synthèse cohérents d'un niveau à l'autre", async () => {
      const departments = await repos.summary.getGroups({ path: [], dimension: "department" }, viewer);
      const first = departments.find((g) => g.count > 0);
      if (!first) return;
      const employees = await repos.summary.getGroups({ path: [first.key], dimension: "employee" }, viewer);
      const sum = employees.reduce((acc, g) => acc + g.totals.worked, 0);
      assert.ok(Math.abs(sum - first.totals.worked) < 0.01, `somme ${sum} ≠ total ${first.totals.worked}`);
      const firstEmployee = employees[0];
      assert.ok(firstEmployee);
      const lines = await repos.summary.getLines({ path: [first.key, firstEmployee.key] }, viewer);
      assert.equal(lines.length, Math.min(firstEmployee.count, 500));
    });

    if (options.writes && options.employeeId !== undefined) {
      const employeeId = options.employeeId;
      it("enchaîne arrivée, refus d'une double arrivée, départ et correction", async () => {
        if (await repos.attendances.getOpenAttendance(employeeId, viewer)) {
          await repos.attendances.checkOut({ employeeId }, viewer);
        }
        const start = new Date(Date.now() - 2 * 3_600_000).toISOString();
        const arrival = await repos.attendances.checkIn(
          { employeeId, at: start, movements: { transportArrival: true } },
          viewer,
        );
        assert.equal(arrival.checkOut, null);
        assert.equal(arrival.movements.transportArrival, true);

        await assert.rejects(
          repos.attendances.checkIn({ employeeId }, viewer),
          (e: unknown) => e instanceof DomainError && e.code === "conflict",
        );

        const departure = await repos.attendances.checkOut({ employeeId, movements: { meals: 1 } }, viewer);
        assert.equal(departure.id, arrival.id);
        assert.ok(departure.workedHours > 1.9 && departure.workedHours < 2.1, `heures : ${departure.workedHours}`);
        assert.equal(departure.movements.meals, 1);
        assert.equal(await repos.attendances.getOpenAttendance(employeeId, viewer), null);

        const corrected = await repos.attendances.updateAttendance(arrival.id, { movements: { breakDeparture: true } }, viewer);
        assert.equal(corrected.movements.breakDeparture, true);

        await assert.rejects(
          repos.attendances.updateAttendance(
            arrival.id,
            { checkOut: new Date(Date.parse(start) - 3_600_000).toISOString() },
            viewer,
          ),
          (e: unknown) => e instanceof DomainError && e.code === "business_rule",
        );
      });
    }
  });
}
