// domain/SummaryRepository.ts — Port synthèse. Aucun terme Odoo.

import type { SummaryGroup, SummaryGroupsParams, SummaryLine, SummaryLinesParams } from "./summary.js";
import type { ViewerContext } from "./tree.js";

export interface SummaryRepository {
  /** Un niveau de regroupement avec ses totaux, sous un chemin déjà ouvert. */
  getGroups(params: SummaryGroupsParams, viewer: ViewerContext): Promise<SummaryGroup[]>;
  /** Lignes de détail sous un chemin entièrement ouvert. */
  getLines(params: SummaryLinesParams, viewer: ViewerContext): Promise<SummaryLine[]>;
}
