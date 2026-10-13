// app/trace.ts — Journal des appels (PoC).
// Pour chaque appel de port (ex. AttendanceRepository.checkIn), garde les appels
// faits au moteur derrière (ex. hr.attendance.create). C'est la preuve visible
// que l'écran ne parle qu'au port, et que l'adapter fait la traduction.

import { AsyncLocalStorage } from "node:async_hooks";

export interface BackendCall {
  call: string;
  ms: number;
  ok: boolean;
}

export interface TraceEntry {
  id: number;
  at: string;
  port: string;
  ms: number;
  ok: boolean;
  error?: string;
  backend: BackendCall[];
}

/** Ce que les adapters voient du journal : une seule méthode, aucune dépendance. */
export interface BackendRecorder {
  recordBackend(call: string, ms: number, ok: boolean): void;
}

const storage = new AsyncLocalStorage<TraceEntry>();

export class Tracer implements BackendRecorder {
  private readonly entries: TraceEntry[] = [];
  private seq = 0;

  constructor(private readonly max = 200) {}

  /** Enveloppe un repository : chaque méthode appelée devient une entrée du journal. */
  wrap<T extends object>(portName: string, repo: T): T {
    const tracer = this;
    return new Proxy(repo, {
      get(target, prop, receiver) {
        const value: unknown = Reflect.get(target, prop, receiver);
        if (typeof value !== "function") return value;
        return async (...args: unknown[]) => {
          const entry: TraceEntry = {
            id: ++tracer.seq,
            at: new Date().toISOString(),
            port: `${portName}.${String(prop)}`,
            ms: 0,
            ok: true,
            backend: [],
          };
          const started = performance.now();
          try {
            return await storage.run(entry, () => (value as (...a: unknown[]) => unknown).apply(target, args));
          } catch (error) {
            entry.ok = false;
            entry.error = error instanceof Error ? error.message : String(error);
            throw error;
          } finally {
            entry.ms = Math.round(performance.now() - started);
            tracer.push(entry);
          }
        };
      },
    });
  }

  recordBackend(call: string, ms: number, ok: boolean): void {
    storage.getStore()?.backend.push({ call, ms: Math.round(ms), ok });
  }

  recent(limit = 60): TraceEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  private push(entry: TraceEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max);
  }
}
