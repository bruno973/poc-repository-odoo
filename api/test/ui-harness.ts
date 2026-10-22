// test/ui-harness.ts — API complète (identité réelle) devant le faux Odoo enrichi
// de son comportement « interface » ; clients HTTP par utilisateur.

import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { createRepositories } from "../src/app/repositories.js";
import { Tracer } from "../src/app/trace.js";
import { createServer } from "../src/server.js";
import { FakeOdoo } from "./fake-odoo.js";
import { type UiState, uiHandler, uiState } from "./fake-odoo-ui.js";

export interface UiHarness {
  odoo: FakeOdoo;
  state: UiState;
  app: FastifyInstance;
  as(login: string, password: string): Promise<UiClient>;
  close(): Promise<void>;
}

export interface UiClient {
  get(url: string): Promise<LightMyRequestResponse>;
  post(url: string, body?: unknown, headers?: Record<string, string>): Promise<LightMyRequestResponse>;
  patch(url: string, body: unknown, headers?: Record<string, string>): Promise<LightMyRequestResponse>;
  cookie: string;
}

const CSRF = { "x-leila-csrf": "1" };

export function client(app: FastifyInstance, cookie: string): UiClient {
  const headers = { cookie };
  return {
    cookie,
    get: (url) => app.inject({ method: "GET", url, headers }),
    post: (url, body = {}, extra = CSRF) => app.inject({ method: "POST", url, headers: { ...headers, ...extra }, payload: body as object }),
    patch: (url, body, extra = CSRF) => app.inject({ method: "PATCH", url, headers: { ...headers, ...extra }, payload: body as object }),
  };
}

export async function login(app: FastifyInstance, user: string, password: string): Promise<UiClient> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { login: user, password }, headers: CSRF, remoteAddress: `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  if (res.statusCode !== 204) throw new Error(`Connexion refusée pour ${user} : ${res.statusCode} ${res.body}`);
  return client(app, String(res.headers["set-cookie"]).split(";")[0] ?? "");
}

export async function startUiHarness(env: Record<string, string> = {}): Promise<UiHarness> {
  const state = uiState();
  const odoo = await new FakeOdoo(undefined, [uiHandler(state)]).start();
  const tracer = new Tracer();
  const repos = await createRepositories({ ADAPTER: "odoo", AUTH_MODE: "odoo-session", ODOO_URL: odoo.url, ODOO_DB: "test", ...env }, tracer);
  const app = await createServer(repos, tracer, { cookieSecure: false, logger: false, loginAttemptsPerMinute: 1000 });
  return {
    odoo,
    state,
    app,
    as: (user, password) => login(app, user, password),
    close: async () => {
      await app.close();
      await odoo.stop();
    },
  };
}

/** Navigation → première action utilisable portant ce titre → descripteur. */
export async function openAction(c: UiClient, title: string) {
  const nav = (await c.get("/api/ui/v1/navigation")).json() as { menus: { label: string; actionKey?: string; available: boolean; children: unknown[] }[] };
  const all: { label: string; actionKey?: string; available: boolean }[] = [];
  const walk = (ms: { label: string; actionKey?: string; available: boolean; children: unknown[] }[]) =>
    ms.forEach((m) => (all.push(m), walk(m.children as typeof ms)));
  walk(nav.menus);
  const menu = all.find((m) => m.label === title && m.actionKey);
  if (!menu?.actionKey) throw new Error(`Menu introuvable : ${title}`);
  return (await c.get(`/api/ui/v1/actions/${menu.actionKey}`)).json() as {
    actionKey: string;
    resourceKey: string;
    available: boolean;
    views: { list?: string; form?: string; search?: string };
  };
}
