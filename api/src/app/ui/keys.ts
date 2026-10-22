// app/ui/keys.ts — Clés opaques des actions, vues, ressources et commandes.
//
// Une clé est un HMAC de (propriétaire, type, cible) : stable pour un même
// utilisateur (liens réutilisables entre deux connexions), inutilisable par un
// autre utilisateur, impossible à fabriquer. La cible (ce que la clé désigne
// dans le moteur) ne quitte jamais le serveur.

import { createHmac, randomBytes } from "node:crypto";
import { DomainError } from "../../domain/errors.js";

export type KeyKind = "action" | "view" | "resource" | "command" | "menu";

interface Entry<T> {
  owner: string;
  kind: KeyKind;
  target: T;
}

export class KeyRegistry {
  private readonly entries = new Map<string, Entry<unknown>>();
  private readonly secret: Buffer;

  constructor(secret: Buffer = randomBytes(32), private readonly max = 50_000) {
    this.secret = secret;
  }

  issue<T>(owner: string, kind: KeyKind, target: T): string {
    const key = createHmac("sha256", this.secret)
      .update(`${owner}\u0000${kind}\u0000${JSON.stringify(target)}`)
      .digest("base64url")
      .slice(0, 22);
    if (!this.entries.has(key)) {
      if (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value as string);
      this.entries.set(key, { owner, kind, target });
    }
    return key;
  }

  /** Cible de la clé pour CE propriétaire ; sinon not_found (pas de différence entre « inconnue » et « à autrui »). */
  resolve<T>(owner: string, kind: KeyKind, key: string): T {
    const entry = this.entries.get(key);
    if (!entry || entry.owner !== owner || entry.kind !== kind) {
      throw new DomainError("Élément introuvable.", "not_found");
    }
    return entry.target as T;
  }
}
