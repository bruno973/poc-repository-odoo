// web/src/types/domain.ts
// Les types viennent directement du domaine de l'API (une seule source de vérité,
// plus de copie qui dérive). Imports « type » uniquement : ils sont effacés à la
// compilation, donc l'image Docker du front n'a pas besoin du dossier api/.

export type {
  Ref,
  ViewerRole,
  ViewerContext,
  VisibleIf,
  TextField,
  SelectField,
  Many2OneField,
  GroupNode,
  FormNode,
  EmployeeHeaderSummary,
  OrgChartNode,
  EmployeeSummary,
  EmployeeFormRecord,
  EmployeeListResult,
  DepartmentNode,
} from "@api/domain/tree.js";

export type {
  Attendance,
  AttendanceCapabilities,
  AttendancePage,
  HoursStatus,
  Movements,
} from "@api/domain/attendance.js";

export type { PublicIdentity } from "@api/domain/identity.js";

export type {
  SummaryDimension,
  SummaryGroup,
  SummaryKey,
  SummaryLine,
  SummaryTotals,
} from "@api/domain/summary.js";
