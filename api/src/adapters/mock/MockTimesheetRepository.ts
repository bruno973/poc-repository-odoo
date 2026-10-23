// adapters/mock/MockTimesheetRepository.ts — « Mes présences » sans ERP : les pointages
// de la fiche de l'utilisateur, ventilés par le magasin de démonstration.

import type { TimesheetRepository } from "../../domain/TimesheetRepository.js";
import { type AttendanceRow, buildTimesheet, type MyTimesheet } from "../../domain/timesheet.js";
import type { ViewerContext } from "../../domain/tree.js";
import type { MockTimeStore } from "./MockTimeRepositories.js";

export class MockTimesheetRepository implements TimesheetRepository {
  constructor(private readonly store: MockTimeStore) {}

  async mine(viewer: ViewerContext): Promise<MyTimesheet> {
    const timezone = "America/Cayenne";
    const own = viewer.employeeId;
    const lines = own === undefined ? [] : this.store.lines.filter((l) => l.employee.id === own);
    const rows: AttendanceRow[] = lines.map((l) => ({
      id: l.id,
      checkIn: l.checkIn,
      checkOut: l.checkOut,
      workedHours: l.totals.worked,
      ventilations: [
        {
          periodLabel: l.keys.period.label,
          weekNumber: null,
          weekLabel: l.keys.week.label,
          dayName: l.weekday,
          hours: { day: l.totals.day, night: l.totals.night, overtime25: l.totals.overtime25, overtime50: l.totals.overtime50, publicHoliday: 0, sunday: l.totals.sunday, total: l.totals.worked },
          flags: {
            breakEntry: l.totals.daysBreakArrival > 0,
            transportArrival: l.totals.daysTransportArrival > 0,
            transportDeparture: l.totals.daysTransportDeparture > 0,
            breakExit: l.totals.daysBreakDeparture > 0,
          },
        },
      ],
    }));
    return {
      employee: lines[0]?.employee ?? null,
      timezone,
      timezoneFallback: false,
      detail: "full",
      periods: buildTimesheet(rows, timezone),
      truncated: false,
    };
  }
}
