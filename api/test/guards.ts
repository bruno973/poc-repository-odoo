// test/guards.ts — Garde-fou des suites qui ÉCRIVENT dans Odoo (§ 8, risque R-01).
// La base visée doit figurer dans ODOO_WRITE_ALLOWED_DBS (valeur PoC : amg).

export function assertWritableDb(env: NodeJS.ProcessEnv): void {
  const db = env["ODOO_DB"] ?? "";
  const allowed = (env["ODOO_WRITE_ALLOWED_DBS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(db)) {
    throw new Error(
      `Écritures refusées : la base « ${db} » n'est pas dans ODOO_WRITE_ALLOWED_DBS (${allowed.join(", ") || "vide"}).`,
    );
  }
}
