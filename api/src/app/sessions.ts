// app/sessions.ts — Sessions Leila, en mémoire (PoC : perdues au redémarrage, R-06).
//
// Identifiant aléatoire de 256 bits → Principal. Le Principal ne contient ni mot
// de passe, ni jeton du moteur : seulement une poignée opaque vers la session moteur.
// Expiration : inactivité (1 h) et durée absolue (8 h) par défaut.

import { randomBytes } from "node:crypto";
import type { Principal } from "../domain/identity.js";

export interface SessionStoreOptions {
  idleMs?: number;
  absoluteMs?: number;
  /** Horloge injectable (tests) */
  now?: () => number;
}

interface Entry {
  principal: Principal;
  createdAt: number;
  lastSeen: number;
}

export class SessionStore {
  private readonly entries = new Map<string, Entry>();
  readonly idleMs: number;
  readonly absoluteMs: number;
  private readonly now: () => number;

  constructor(options: SessionStoreOptions = {}) {
    this.idleMs = options.idleMs ?? 60 * 60_000;
    this.absoluteMs = options.absoluteMs ?? 8 * 60 * 60_000;
    this.now = options.now ?? Date.now;
  }

  create(principal: Principal): string {
    const id = randomBytes(32).toString("base64url");
    const at = this.now();
    this.entries.set(id, { principal, createdAt: at, lastSeen: at });
    return id;
  }

  /** Principal de la session, et prolonge l'inactivité ; null si absente ou expirée. */
  get(id: string): Principal | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    const at = this.now();
    if (this.expired(entry, at)) return null;
    entry.lastSeen = at;
    return entry.principal;
  }

  destroy(id: string): Principal | null {
    const entry = this.entries.get(id);
    this.entries.delete(id);
    return entry?.principal ?? null;
  }

  /** Retire les sessions expirées et les renvoie (pour fermer la session moteur). */
  purgeExpired(): Principal[] {
    const at = this.now();
    const expired: Principal[] = [];
    for (const [id, entry] of this.entries) {
      if (this.expired(entry, at)) {
        this.entries.delete(id);
        expired.push(entry.principal);
      }
    }
    return expired;
  }

  get size(): number {
    return this.entries.size;
  }

  /** Pour les tests de sécurité : tout ce que le store contient, sérialisé. */
  dump(): string {
    return JSON.stringify([...this.entries.values()]);
  }

  private expired(entry: Entry, at: number): boolean {
    return at - entry.lastSeen > this.idleMs || at - entry.createdAt > this.absoluteMs;
  }
}
