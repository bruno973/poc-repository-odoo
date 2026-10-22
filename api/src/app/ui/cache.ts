// app/ui/cache.ts — Cache des DÉFINITIONS de vues (jamais des données).
// Clé fournie par l'adaptateur : base, utilisateur, groupes, sociétés, langue,
// action, vues… Durée courte + invalidation explicite (ADR-001 § 7).

export class DefinitionCache<T> {
  private readonly entries = new Map<string, { at: number; value: Promise<T> }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    const value = load();
    this.entries.set(key, { at: this.now(), value });
    value.catch(() => this.entries.delete(key));
    return value;
  }

  clear(): number {
    const n = this.entries.size;
    this.entries.clear();
    return n;
  }
}
