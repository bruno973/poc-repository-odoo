// adapters/odoo18/client.ts — Client de l'API externe Odoo 18.
//
// Changement par rapport à la version précédente : on passe par l'API externe
// officielle (/jsonrpc, service "object", execute_kw) au lieu des routes du
// client web (/web/session/authenticate + /web/dataset/call_kw).
//  - accepte une clé d'API à la place du mot de passe (les clés ne fonctionnent
//    pas sur /web/session/authenticate) ;
//  - ne dépend plus d'un cookie de session, donc plus de relance sur expiration ;
//  - c'est ce client seul qu'il faudra remplacer pour l'API JSON-2 d'Odoo 19+.
//
// L'interface publique ne change pas : authenticate() et callKw({ model, method, args, kwargs }).

import { DomainError } from "../../domain/errors.js";
import type { BackendRecorder } from "../../app/trace.js";

export interface OdooClientConfig {
  url: string;
  db: string;
  user: string;
  /** Mot de passe ou, de préférence, clé d'API du compte */
  password: string;
  lang?: string;
  tz?: string;
}

export interface CallKwParams {
  model: string;
  method: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
}

interface OdooRpcError {
  code?: number;
  message?: string;
  data?: { name?: string; message?: string };
}

type OdooResponse<T> = { jsonrpc: "2.0"; id: number; result: T } | { jsonrpc: "2.0"; id: number; error: OdooRpcError };

export class OdooClient {
  private uid: number | null = null;
  private reqId = 1;

  constructor(
    private readonly config: OdooClientConfig,
    private readonly recorder?: BackendRecorder,
  ) {}

  get login(): string {
    return this.config.user;
  }

  async authenticate(): Promise<number> {
    if (this.uid !== null) return this.uid;
    const uid = await this.rpc<number | false>("common", "authenticate", [
      this.config.db,
      this.config.user,
      this.config.password,
      {},
    ]);
    if (!uid) {
      throw new DomainError(
        `Odoo refuse les identifiants de ${this.config.user} sur la base ${this.config.db}.`,
        "unauthenticated",
      );
    }
    this.uid = uid;
    return uid;
  }

  async callKw<T>(params: CallKwParams): Promise<T> {
    const uid = await this.authenticate();
    const userContext = (params.kwargs["context"] as Record<string, unknown> | undefined) ?? {};
    const kwargs = {
      ...params.kwargs,
      context: { lang: this.config.lang ?? "fr_FR", tz: this.config.tz ?? "America/Cayenne", ...userContext },
    };
    const started = performance.now();
    let ok = true;
    try {
      return await this.rpc<T>("object", "execute_kw", [
        this.config.db,
        uid,
        this.config.password,
        params.model,
        params.method,
        params.args,
        kwargs,
      ]);
    } catch (error) {
      ok = false;
      throw error;
    } finally {
      this.recorder?.recordBackend(`${params.model}.${params.method}`, performance.now() - started, ok);
    }
  }

  private async rpc<T>(service: string, method: string, args: unknown[]): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.config.url.replace(/\/$/, "")}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: this.reqId++, params: { service, method, args } }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new DomainError(`Odoo injoignable à ${this.config.url} (${(error as Error).message}).`, "unavailable");
    }
    if (!res.ok) throw new DomainError(`Odoo a répondu HTTP ${res.status} sur /jsonrpc.`, "unavailable");
    const data = (await res.json()) as OdooResponse<T>;
    if ("error" in data) throw mapOdooError(data.error);
    return data.result;
  }
}

/** Traduit une exception Odoo en erreur domaine. */
export function mapOdooError(error: OdooRpcError): DomainError {
  const name = error.data?.name ?? "";
  const message = (error.data?.message || error.message || "Erreur Odoo").trim();
  if (name.includes("AccessError") || name.includes("AccessDenied")) return new DomainError(message, "forbidden");
  if (name.includes("MissingError")) return new DomainError(message, "not_found");
  if (name.includes("ValidationError") || name.includes("UserError")) return new DomainError(message, "business_rule");
  return new DomainError(`[${name || "Odoo"}] ${message}`, "unavailable");
}

// ─── Conversions communes ─────────────────────────────────────────────────────

/** Odoo stocke les datetimes en UTC sans fuseau : "2026-09-18 18:16:06". */
export function fromOdooDatetime(value: unknown): string | null {
  return typeof value === "string" && value ? `${value.replace(" ", "T")}Z` : null;
}

export function toOdooDatetime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new DomainError(`Date invalide : ${iso}`, "invalid");
  return date.toISOString().slice(0, 19).replace("T", " ");
}
