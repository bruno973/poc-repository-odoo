// scripts/odoo-simulateur.ts — Simulateur Odoo 18 pour la démo et l'E2E du moteur
// générique, sans accès à amg. C'est le faux serveur des tests (test/fake-odoo.ts +
// fake-odoo-ui.ts) : vues résolues reconstruites, droits simulés par utilisateur.
//
//   npm run simulateur            → Odoo simulé sur http://127.0.0.1:8069
//   POST http://127.0.0.1:8070/heritage
//        simule l'installation d'un héritage de vue (champ « badge_id » ajouté à la
//        fiche employé), comme un module leila_hr mis à jour dans Odoo.
//
// Comptes : p.admin / admin-pw, p.manager / manager-pw, p.employe / employe-pw.
// API à lancer avec : ADAPTER=odoo AUTH_MODE=odoo-session ODOO_URL=http://127.0.0.1:8069 ODOO_DB=simulateur

import { createServer } from "node:http";
import { FakeOdoo } from "../test/fake-odoo.js";
import { uiHandler, uiState } from "../test/fake-odoo-ui.js";

const port = Number(process.env["SIMULATEUR_PORT"] ?? 8069);
const state = uiState();
const odoo = await new FakeOdoo(undefined, [uiHandler(state)]).start(port);
console.log(`Odoo 18 simulé sur ${odoo.url} (contrôle : http://127.0.0.1:${port + 1}/heritage)`);

createServer((req, res) => {
  if (req.method === "POST" && req.url === "/heritage") {
    const fields = state.fields["hr.employee"] ?? {};
    if (!fields["badge_id"]) {
      state.fields["hr.employee"] = { ...fields, badge_id: { type: "char", string: "Badge (leila_hr)" } };
      state.archs["hr.employee:form"] = (state.archs["hr.employee:form"] ?? "").replace('<field name="work_phone"/>', '<field name="work_phone"/><field name="badge_id"/>');
      for (const e of state.employees) e["badge_id"] = `B-${e.id}`;
    }
    res.end("héritage installé : champ badge_id ajouté à la fiche employé\n");
    return;
  }
  res.statusCode = 404;
  res.end();
}).listen(port + 1, "127.0.0.1");
