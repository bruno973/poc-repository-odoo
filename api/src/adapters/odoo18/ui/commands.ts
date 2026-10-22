// adapters/odoo18/ui/commands.ts — Registre FERMÉ des commandes métier exécutables
// depuis un écran importé (ADR-001 § 5). Un bouton XML n'est exécutable que s'il
// correspond à une entrée ici. Ajouter une commande = ajouter une ligne, sans
// toucher au moteur React. Aucun autre appel de méthode n'est possible.

export interface OdooCommand {
  /** Identifiant Leila stable (jamais transmis tel quel : une clé opaque est émise) */
  id: string;
  model: string;
  method: string;
}

export const ODOO_COMMANDS: readonly OdooCommand[] = [
  { id: "attendance.approve-hours", model: "hr.attendance", method: "action_approve_overtime" },
  { id: "attendance.refuse-hours", model: "hr.attendance", method: "action_refuse_overtime" },
];
