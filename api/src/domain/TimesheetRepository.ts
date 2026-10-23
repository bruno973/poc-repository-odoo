// domain/TimesheetRepository.ts — Port « Mes présences ». Aucun terme d'ERP.
//
// Toujours les pointages de l'utilisateur connecté, lus avec SES droits : aucun
// paramètre ne permet de demander ceux d'un autre.

import type { MyTimesheet } from "./timesheet.js";
import type { ViewerContext } from "./tree.js";

export interface TimesheetRepository {
  mine(viewer: ViewerContext): Promise<MyTimesheet>;
}
