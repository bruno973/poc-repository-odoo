// test/timesheet.test.ts — « Mes présences » : agrégation (périodes, semaines, totaux) et
// accès portail (Q-10) : ses pointages seulement, avec ses droits, sans sudo.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildTimesheet, isoWeek, localDay, type MyTimesheet, type VentilationRow } from "../src/domain/timesheet.js";
import { startUiHarness, type UiClient, type UiHarness } from "./ui-harness.js";

const H = (day: number, night = 0, total = day + night) => ({ day, night, overtime25: 0, overtime50: 0, publicHoliday: 0, sunday: 0, total });
const flags = { breakEntry: false, transportArrival: false, transportDeparture: false, breakExit: false };
const vent = (period: string, week: number, hours = H(7)): VentilationRow => ({ periodLabel: period, weekNumber: week, weekLabel: `S${week}`, dayName: "Lundi", hours, flags });

describe("Mes présences : agrégation", () => {
  it("date locale dans le fuseau de l'employé (UTC-3 : 02:00Z est encore la veille)", () => {
    assert.deepEqual(localDay("2026-09-18T02:00:00Z", "America/Cayenne"), { date: "2026-09-17", weekday: 4 });
    assert.deepEqual(isoWeek("2026-09-17"), { year: 2026, week: 38 });
    assert.deepEqual(isoWeek("2021-01-03"), { year: 2020, week: 53 });
  });
  it("période puis semaine de la ventilation, du plus récent au plus ancien, totaux additionnés", () => {
    const periods = buildTimesheet(
      [
        { id: 1, checkIn: "2026-09-14T11:00:00Z", checkOut: "2026-09-14T19:00:00Z", workedHours: 8, ventilations: [vent("Septembre", 38, H(6, 1)), vent("Septembre", 38, H(1))] },
        { id: 2, checkIn: "2026-09-21T11:00:00Z", checkOut: null, workedHours: 0, ventilations: [vent("Septembre", 39, H(0))] },
        { id: 3, checkIn: "2026-10-01T11:00:00Z", checkOut: "2026-10-01T19:00:00Z", workedHours: 8, ventilations: [vent("Octobre", 40)] },
      ],
      "America/Cayenne",
    );
    assert.deepEqual(periods.map((p) => [p.label, p.weeks.map((w) => w.label)]), [["Octobre", ["S40"]], ["Septembre", ["S39", "S38"]]]);
    const s38 = periods[1]?.weeks[1];
    assert.deepEqual(s38?.days[0]?.hours, H(7, 1), "deux lignes de ventilation additionnées");
    assert.deepEqual(periods[1]?.totals, H(7, 1));
    assert.equal(periods[1]?.workedHours, 8);
  });
  it("ventilation illisible : mois et semaine ISO locaux, heures pointées seules", () => {
    const [p] = buildTimesheet([{ id: 1, checkIn: "2026-09-18T02:00:00Z", checkOut: null, workedHours: 3, ventilations: null }], "America/Cayenne");
    assert.equal(p?.label, "septembre 2026");
    assert.equal(p?.weeks[0]?.label, "Semaine 38 (2026)");
    assert.equal(p?.weeks[0]?.days[0]?.dayName, "Jeudi");
    assert.equal(p?.weeks[0]?.days[0]?.hours, null);
    assert.equal(p?.totals, null);
  });
  it("pas encore ventilé : « Sans période », heures à zéro", () => {
    const [p] = buildTimesheet([{ id: 1, checkIn: "2026-09-18T12:00:00Z", checkOut: null, workedHours: 3, ventilations: [] }], "UTC");
    assert.equal(p?.label, "Sans période");
    assert.deepEqual(p?.totals, H(0));
  });
});

describe("Mes présences : comptes portail et internes (identité réelle)", () => {
  let h: UiHarness;
  let portail: UiClient;
  let employe: UiClient;
  let manager: UiClient;
  before(async () => {
    h = await startUiHarness();
    [portail, employe, manager] = await Promise.all([h.as("p.portail", "portail-pw"), h.as("p.employe", "employe-pw"), h.as("p.manager", "manager-pw")]);
  });
  after(() => h.close());
  const mine = async (c: UiClient) => {
    const res = await c.get("/api/me/timesheet");
    assert.equal(res.statusCode, 200, res.body);
    return res.json() as MyTimesheet;
  };
  const ids = (t: MyTimesheet) => t.periods.flatMap((p) => p.weeks.flatMap((w) => w.days.map((d) => d.attendanceId)));

  it("portail : connexion acceptée, identité marquée portail", async () => {
    const me = (await portail.get("/api/auth/me")).json() as { portal: boolean; role: string; employeeId: number };
    assert.deepEqual([me.portal, me.role, me.employeeId], [true, "employee", 20]);
  });

  it("portail sans droit sur la ventilation : ses pointages seuls, absences automatiques exclues", async () => {
    h.odoo.portalVentilation = false;
    const t = await mine(portail);
    assert.equal(t.detail, "attendance-only");
    assert.deepEqual(ids(t).sort(), [21, 22]);
    assert.equal(t.employee?.label, "Paul Portail");
    assert.ok(t.timezoneFallback, "fuseau non renseigné : défaut signalé");
  });

  it("portail avec droit sur la ventilation (règle du module) : périodes, semaines et heures", async () => {
    h.odoo.portalVentilation = true;
    try {
      const t = await mine(portail);
      assert.equal(t.detail, "full");
      assert.deepEqual(t.periods.map((p) => p.label), ["Octobre 2026", "Septembre 2026"]);
      const sept = t.periods[1]?.weeks[0]?.days[0];
      assert.deepEqual(sept?.hours, { day: 5, night: 3, overtime25: 1, overtime50: 0, publicHoliday: 0, sunday: 0, total: 9 });
      assert.deepEqual(sept?.flags, { breakEntry: true, transportArrival: true, transportDeparture: false, breakExit: false });
    } finally {
      h.odoo.portalVentilation = false;
    }
  });

  it("toujours SA fiche : domaine restreint à son employé, sans sudo ni paramètre", async () => {
    h.odoo.reset();
    await mine(manager);
    const call = h.odoo.calls.find((c) => c.model === "hr.attendance" && c.method === "search_read");
    assert.deepEqual((call?.args[0] as unknown[])[0], ["employee_id", "=", 5]);
    assert.deepEqual(ids(await mine(manager)), [13], "le manager voit son équipe mais « Mes présences » ne montre que les siennes");
    assert.deepEqual(ids(await mine(employe)), [11]);
    assert.equal((await mine(employe)).detail, "full");
  });

  it("portail : aucun accès aux écrans du back-office (refus d'Odoo)", async () => {
    assert.equal((await portail.get("/api/ui/v1/navigation")).statusCode, 403);
  });
});
