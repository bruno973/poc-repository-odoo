// adapters/odoo18/transport.ts — Comment l'adapter parle à Odoo, et SOUS QUELLE IDENTITÉ.
//
// Les repositories ne connaissent que OdooTransport.callKw ; la fabrique choisit
// le transport à partir du viewer :
//  - SharedAccounts (AUTH_MODE=shared) : un compte technique par rôle, API externe
//    /jsonrpc + clé d'API (OdooClient). Odoo voit le compte « manager », pas la personne.
//  - UserSessions (AUTH_MODE=odoo-session) : la session Odoo de l'utilisateur
//    (/web/session/authenticate puis /web/dataset/call_kw + cookie). Odoo applique
//    droits, règles d'enregistrement et groupes de champs à la vraie personne.
//
// Le mot de passe ne transite que dans SessionTransport.authenticate : il n'est
// ni gardé, ni journalisé. Seul le cookie de session Odoo est conservé, en mémoire.

import { randomBytes } from "node:crypto";
import type { BackendRecorder } from "../../app/trace.js";
import { DomainError } from "../../domain/errors.js";
import { LOGIN_REFUSED } from "../../domain/identity.js";
import type { ViewerContext, ViewerRole } from "../../domain/tree.js";
import { type CallKwParams, mapOdooError } from "./client.js";

export interface OdooTransport {
  /** uid Odoo du compte qui porte les appels */
  userId(): Promise<number>;
  callKw<T>(params: CallKwParams): Promise<T>;
  /**
   * Définition d'une action par la route du client web (/web/action/load), qui la lit
   * en sudo pour l'utilisateur : un compte non administrateur ne peut pas lire
   * ir.actions.act_window par l'ORM (constaté sur amg). Absent du transport jsonrpc.
   */
  loadAction?(actionId: number): Promise<Record<string, unknown> | false>;
}

export interface OdooTransportFactory {
  /** shared : comptes partagés par rôle ; session : session Odoo de l'utilisateur */
  readonly mode: "shared" | "session";
  for(viewer: ViewerContext): OdooTransport;
}

export interface OdooConnection {
  url: string;
  db: string;
  lang?: string;
  tz?: string;
}

// ─── Mode shared ──────────────────────────────────────────────────────────────

export class SharedAccounts implements OdooTransportFactory {
  readonly mode = "shared" as const;
  constructor(private readonly byRole: Record<ViewerRole, OdooTransport>) {}

  for(viewer: ViewerContext): OdooTransport {
    return this.byRole[viewer.role];
  }
}

// ─── Mode odoo-session ────────────────────────────────────────────────────────

interface JsonRpcError {
  code?: number;
  message?: string;
  data?: { name?: string; message?: string };
}

const SESSION_COOKIE = "session_id";

/** Informations renvoyées par /web/session/authenticate (sous-ensemble utile). */
export interface OdooSessionInfo {
  uid: number;
  name?: string;
  username?: string;
}

export class SessionTransport implements OdooTransport {
  private reqId = 1;

  private constructor(
    private readonly conn: OdooConnection,
    private cookie: string,
    readonly uid: number,
    readonly info: OdooSessionInfo,
    private readonly recorder?: BackendRecorder,
  ) {}

  /**
   * Ouvre une session Odoo au nom de l'utilisateur. Le mot de passe n'est utilisé
   * que pour cet appel. Refus (identifiants, 2FA requise) → message générique.
   */
  static async authenticate(
    conn: OdooConnection,
    login: string,
    password: string,
    recorder?: BackendRecorder,
  ): Promise<SessionTransport> {
    let reply: { result: unknown; cookie: string | null };
    try {
      reply = await post(conn, "/web/session/authenticate", { db: conn.db, login, password }, null, 1);
    } catch (error) {
      if (error instanceof DomainError && error.code !== "unavailable") {
        throw new DomainError(LOGIN_REFUSED, "unauthenticated");
      }
      throw error;
    }
    const info = reply.result as Partial<OdooSessionInfo> | null;
    // uid absent : identifiants refusés ou seconde étape (2FA) demandée, hors périmètre du PoC.
    if (!info || typeof info.uid !== "number" || !reply.cookie) {
      throw new DomainError(LOGIN_REFUSED, "unauthenticated");
    }
    return new SessionTransport(conn, reply.cookie, info.uid, info as OdooSessionInfo, recorder);
  }

  userId(): Promise<number> {
    return Promise.resolve(this.uid);
  }

  async callKw<T>(params: CallKwParams): Promise<T> {
    const userContext = (params.kwargs["context"] as Record<string, unknown> | undefined) ?? {};
    const kwargs = {
      ...params.kwargs,
      context: { lang: this.conn.lang ?? "fr_FR", tz: this.conn.tz ?? "America/Cayenne", ...userContext },
    };
    const started = performance.now();
    let ok = true;
    try {
      return (await this.send(`/web/dataset/call_kw/${params.model}/${params.method}`, {
        model: params.model,
        method: params.method,
        args: params.args,
        kwargs,
      })) as T;
    } catch (error) {
      ok = false;
      throw error;
    } finally {
      this.recorder?.recordBackend(`${params.model}.${params.method}`, performance.now() - started, ok, this.uid);
    }
  }

  async loadAction(actionId: number): Promise<Record<string, unknown> | false> {
    const started = performance.now();
    let ok = true;
    try {
      return ((await this.send("/web/action/load", { action_id: actionId })) as Record<string, unknown> | false) ?? false;
    } catch (error) {
      ok = false;
      throw error;
    } finally {
      this.recorder?.recordBackend("web.action.load", performance.now() - started, ok, this.uid);
    }
  }

  /** La session Odoo est-elle toujours valide pour cet utilisateur ? */
  async isAlive(): Promise<boolean> {
    try {
      const info = (await this.send("/web/session/get_session_info", {})) as { uid?: unknown } | null;
      return info?.uid === this.uid;
    } catch (error) {
      if (error instanceof DomainError && error.code === "unauthenticated") return false;
      throw error;
    }
  }

  async destroy(): Promise<void> {
    await this.send("/web/session/destroy", {});
  }

  private async send(path: string, params: Record<string, unknown>): Promise<unknown> {
    const reply = await post(this.conn, path, params, this.cookie, this.reqId++);
    // Odoo peut faire tourner l'identifiant de session : on suit.
    if (reply.cookie) this.cookie = reply.cookie;
    return reply.result;
  }
}

async function post(
  conn: OdooConnection,
  path: string,
  params: Record<string, unknown>,
  cookie: string | null,
  id: number,
): Promise<{ result: unknown; cookie: string | null }> {
  let res: Response;
  try {
    res = await fetch(`${conn.url.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: `${SESSION_COOKIE}=${cookie}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", id, params }),
      signal: AbortSignal.timeout(15_000),
      redirect: "manual",
    });
  } catch (error) {
    throw new DomainError(`Odoo injoignable à ${conn.url} (${(error as Error).message}).`, "unavailable");
  }
  if (!res.ok) throw new DomainError(`Odoo a répondu HTTP ${res.status} sur ${path}.`, "unavailable");
  const data = (await res.json()) as { result?: unknown; error?: JsonRpcError };
  if (data.error) throw mapOdooError(data.error);
  return { result: data.result, cookie: sessionCookie(res.headers) };
}

function sessionCookie(headers: Headers): string | null {
  for (const line of headers.getSetCookie()) {
    const [pair] = line.split(";");
    const eq = pair?.indexOf("=") ?? -1;
    if (pair && eq > 0 && pair.slice(0, eq).trim() === SESSION_COOKIE) return pair.slice(eq + 1).trim();
  }
  return null;
}

/**
 * Sessions Odoo des utilisateurs connectés, indexées par une poignée opaque
 * (256 bits d'aléa). La poignée voyage dans le viewer côté serveur ; le cookie
 * Odoo ne quitte jamais cet objet.
 */
export class UserSessions implements OdooTransportFactory {
  readonly mode = "session" as const;
  private readonly byHandle = new Map<string, SessionTransport>();

  register(transport: SessionTransport): string {
    const handle = randomBytes(32).toString("base64url");
    this.byHandle.set(handle, transport);
    return handle;
  }

  get(handle: string): SessionTransport | undefined {
    return this.byHandle.get(handle);
  }

  remove(handle: string): SessionTransport | undefined {
    const transport = this.byHandle.get(handle);
    this.byHandle.delete(handle);
    return transport;
  }

  get size(): number {
    return this.byHandle.size;
  }

  handles(): string[] {
    return [...this.byHandle.keys()];
  }

  for(viewer: ViewerContext): OdooTransport {
    const transport = viewer.backendHandle ? this.byHandle.get(viewer.backendHandle) : undefined;
    // Jamais de repli sur un compte partagé : sans session utilisateur, on refuse.
    if (!transport) throw new DomainError("Session expirée : reconnecte-toi.", "unauthenticated");
    return transport;
  }
}
