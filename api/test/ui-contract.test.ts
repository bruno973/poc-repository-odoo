// test/ui-contract.test.ts — Même contrat de présentation côté mock (sans ERP) et
// côté Odoo 18 : formes validées par le package partagé, aucune fuite de transport.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import {
  ActionDescriptorSchema,
  NavigationSchema,
  QueryResultSchema,
  RecordPayloadSchema,
  ViewSchemaSchema,
} from "@leila/ui-schema";
import { createRepositories } from "../src/app/repositories.js";
import { Tracer } from "../src/app/trace.js";
import { createServer } from "../src/server.js";
import { login, startUiHarness, type UiClient, type UiHarness } from "./ui-harness.js";

interface Target {
  name: string;
  setup(): Promise<{ c: UiClient; close(): Promise<void>; actionTitle: string }>;
}

const TARGETS: Target[] = [
  {
    name: "mock (ressource portable, sans ERP)",
    async setup() {
      const tracer = new Tracer();
      const app: FastifyInstance = await createServer(await createRepositories({ ADAPTER: "mock", AUTH_MODE: "fake-jwt" }, tracer), tracer, { cookieSecure: false, logger: false });
      return { c: await login(app, "bruno", "demo"), close: () => app.close(), actionTitle: "Employés (écran générique)" };
    },
  },
  {
    name: "Odoo 18 (faux serveur, vues résolues)",
    async setup() {
      const h: UiHarness = await startUiHarness();
      return { c: await h.as("p.admin", "admin-pw"), close: h.close, actionTitle: "Employés" };
    },
  },
];

for (const target of TARGETS) {
  describe(`Contrat UI : ${target.name}`, () => {
    let c: UiClient;
    let close: () => Promise<void>;
    let title: string;
    before(async () => {
      ({ c, close, actionTitle: title } = await target.setup());
    });
    after(() => close());

    it("navigation → action → vues list/form/search → requête → enregistrement", async () => {
      const nav = NavigationSchema.parse((await c.get("/api/ui/v1/navigation")).json());
      const flat = nav.menus.flatMap(function f(m): typeof nav.menus {
        return [m, ...m.children.flatMap(f)];
      });
      const menu = flat.find((m) => m.label === title && m.actionKey);
      assert.ok(menu?.actionKey);
      const action = ActionDescriptorSchema.parse((await c.get(`/api/ui/v1/actions/${menu.actionKey}`)).json());
      assert.equal(action.available, true);
      for (const type of ["list", "form", "search"] as const) {
        const res = await c.get(`/api/ui/v1/views/${action.views[type]}`);
        assert.equal(res.statusCode, 200, res.body);
        const view = ViewSchemaSchema.parse(res.json());
        assert.equal(view.viewType, type);
        assert.equal(view.resourceKey, action.resourceKey);
      }
      const query = await c.post(`/api/ui/v1/resources/${action.resourceKey}/query`, { limit: 5 });
      assert.equal(query.statusCode, 200, query.body);
      const result = QueryResultSchema.parse(query.json());
      assert.ok(result.records.length > 0 && result.total >= result.records.length);
      const first = result.records[0];
      assert.ok(first);
      const record = RecordPayloadSchema.parse((await c.get(`/api/ui/v1/resources/${action.resourceKey}/records/${first.id}`)).json());
      assert.equal(record.id, first.id);
    });

    it("clé inconnue → 404, clé mal formée → 400", async () => {
      assert.equal((await c.get("/api/ui/v1/views/AAAAAAAAAAAAAAAAAAAAAA")).statusCode, 404);
      assert.equal((await c.get("/api/ui/v1/views/..%2F..%2Fetc")).statusCode, 400);
    });

    it("aucun détail de transport ni d'ERP dans les réponses de navigation", async () => {
      const body = (await c.get("/api/ui/v1/navigation")).body;
      assert.ok(!/ir\.actions|ir\.ui|act_window|hr\.employee|res_model|session_id/.test(body));
    });
  });
}
