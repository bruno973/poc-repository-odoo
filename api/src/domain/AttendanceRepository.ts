// domain/AttendanceRepository.ts — Port pointages. Aucun terme Odoo.

import type {
  Attendance,
  AttendanceListParams,
  AttendancePage,
  AttendancePatch,
  CheckInCommand,
  CheckOutCommand,
} from "./attendance.js";
import type { ViewerContext } from "./tree.js";

export interface AttendanceRepository {
  listAttendances(params: AttendanceListParams, viewer: ViewerContext): Promise<AttendancePage>;
  /** Pointage en cours (arrivée sans départ), s'il existe. */
  getOpenAttendance(employeeId: number, viewer: ViewerContext): Promise<Attendance | null>;
  checkIn(command: CheckInCommand, viewer: ViewerContext): Promise<Attendance>;
  checkOut(command: CheckOutCommand, viewer: ViewerContext): Promise<Attendance>;
  updateAttendance(id: number, patch: AttendancePatch, viewer: ViewerContext): Promise<Attendance>;
  approveHours(id: number, viewer: ViewerContext): Promise<Attendance>;
  refuseHours(id: number, viewer: ViewerContext): Promise<Attendance>;
}
