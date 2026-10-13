// test/odoo-protocol.test.ts — L'adapter Odoo contre un faux serveur JSON-RPC.
// Vérifie ce que l'adapter ENVOIE et comment il TRADUIT les réponses. Sans Odoo.

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { OdooClient } from "../src/adapters/odoo18/client.js";
import { OdooAttendanceRepository } from "../src/adapters/odoo18/OdooAttendanceRepository.js";
import { OdooEmployeeRepository } from "../src/adapters/odoo18/OdooEmployeeRepository.js";
import { OdooSummaryRepository } from "../src/adapters/odoo18/OdooSummaryRepository.js";
import { DomainError } from "../src/domain/errors.js";
import type { ViewerContext, ViewerRole } from "../src/domain/tree.js";

interface Call {
  model: string;
  method: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
}

describe("Adapter Odoo 18 : protocole", () => {
  let server: Server;
  let url = "";
  let calls: Call[] = [];

  before(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => {
        assert.equal(req.url, "/jsonrpc", "l'adapter doit utiliser l'API externe");
        const { params, id } = JSON.parse(body) as { params: { service: string; args: unknown[] }; id: number };
        const reply = (payload: object) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ jsonrpc: "2.0", id, ...payload }));
        };
        if (params.service === "common") return reply({ result: 7 });
        const [, uid, password, model, method, args, kwargs] = params.args as [
          string, number, string, string, string, unknown[], Record<string, unknown>,
        ];
        assert.equal(uid, 7);
        assert.equal(password, "cle-api");
        calls.push({ model, method, args, kwargs });

        if (model === "hr.employee" && method === "fields_get") {
          const requested = (args[0] as string[]) ?? [];
          // Le compte voit name/work_email (modifiables) et job_title (lecture seule).
          // Les champs privés sont omis, comme le fait Odoo pour un compte non RH.
          const visible: Record<string, object> = {
            name: { readonly: false, required: true, type: "char" },
            work_email: { readonly: false, required: false, type: "char" },
            job_title: { readonly: true, required: false, type: "char" },
          };
          return reply({ result: Object.fromEntries(requested.filter((f) => f in visible).map((f) => [f, visible[f]])) });
        }
        if (model === "hr.employee" && method === "read") {
          return reply({ result: [{ id: 5, name: "TEST Agent", work_email: "agent@exemple.gf", job_title: false, child_ids: [] }] });
        }
        if (model === "hr.employee" && method === "write") return reply({ result: true });
        if (model === "hr.attendance.ventilation" && method === "read_group") {
          return reply({
            result: [
              { week_label: "S38 - 14/09/26-20/09/26", week_label_count: 5, worked_hours: 38.5, overtime_hours_t1: 3.5 },
              { week_label: false, week_label_count: 1, worked_hours: 2 },
            ],
          });
        }
        if (model === "hr.attendance" && method === "write") {
          return reply({
            error: { message: "Odoo Server Error", data: { name: "odoo.exceptions.ValidationError", message: "Repas : 3 maximum." } },
          });
        }
        return reply({ error: { message: "inattendu", data: { name: "builtins.Exception", message: `${model}.${method}` } } });
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());
  beforeEach(() => {
    calls = [];
  });

  const viewer: ViewerContext = { id: 1, role: "manager", employeeId: 1 };
  const clients = (): Record<ViewerRole, OdooClient> => {
    const c = new OdooClient({ url, db: "test", user: "poc", password: "cle-api" });
    return { employee: c, manager: c, hr_admin: c };
  };

  it("ne lit que les champs autorisés et met fields_get en cache par compte", async () => {
    const repo = new OdooEmployeeRepository(clients());
    const first = await repo.getEmployeeById(5, viewer);
    await repo.getEmployeeById(5, viewer);
    assert.ok(first);
    assert.equal(calls.filter((c) => c.method === "fields_get").length, 1, "fields_get rappelé à chaque fiche");
    const read = calls.find((c) => c.method === "read");
    assert.deepEqual(new Set(read?.kwargs["fields"] as string[]), new Set(["name", "work_email", "job_title"]));
    assert.equal((read?.kwargs["context"] as { lang: string }).lang, "fr_FR");
  });

  it("refuse d'écrire un champ non modifiable, sans appeler Odoo", async () => {
    const repo = new OdooEmployeeRepository(clients());
    await assert.rejects(
      repo.updateEmployee(5, { "header.jobTitle": "Chef" }, viewer),
      (e: unknown) => e instanceof DomainError && e.code === "forbidden",
    );
    await assert.rejects(
      repo.updateEmployee(5, { "header.inconnu": "x" }, viewer),
      (e: unknown) => e instanceof DomainError && e.code === "invalid",
    );
    assert.equal(calls.filter((c) => c.method === "write").length, 0);
  });

  it("écrit un champ modifiable en le traduisant vers Odoo", async () => {
    const repo = new OdooEmployeeRepository(clients());
    await repo.updateEmployee(5, { "header.workEmail": "nouveau@exemple.gf" }, viewer);
    const write = calls.find((c) => c.method === "write");
    assert.deepEqual(write?.args, [[5], { work_email: "nouveau@exemple.gf" }]);
  });

  it("délègue regroupements et sommes à read_group, y compris pour un axe texte", async () => {
    const repo = new OdooSummaryRepository(clients());
    const groups = await repo.getGroups(
      { path: [{ dimension: "pole", value: null }], dimension: "week", status: "approved" },
      viewer,
    );
    const call = calls.find((c) => c.method === "read_group");
    assert.deepEqual(call?.kwargs["groupby"], ["week_label"]);
    assert.deepEqual(call?.kwargs["domain"], [["parent_id", "=", false], ["overtime_status", "=", "approved"]]);
    // Régression : une valeur texte ne doit pas être lue comme un many2one
    assert.deepEqual(groups[0]?.key, { dimension: "week", value: "S38 - 14/09/26-20/09/26" });
    assert.equal(groups[0]?.label, "S38 - 14/09/26-20/09/26");
    assert.equal(groups[0]?.totals.overtime25, 3.5);
    assert.equal(groups[1]?.label, "Aucun");
  });

  it("traduit une ValidationError Odoo en règle métier", async () => {
    const repo = new OdooAttendanceRepository(clients());
    await assert.rejects(
      repo.updateAttendance(9, { movements: { meals: 4 } }, viewer),
      (e: unknown) => e instanceof DomainError && e.code === "business_rule" && e.message.includes("Repas"),
    );
    assert.deepEqual(calls.find((c) => c.method === "write")?.args, [[9], { meal_count: 4 }]);
  });
});
