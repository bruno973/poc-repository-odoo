// domain/ui/ports.ts — Ports du moteur de présentation (ADR-001). Aucun terme d'ERP.
//
// ViewRepository sert les écrans sans exécuter de transaction ; RecordRepository
// lit et écrit des enregistrements de ressources AUTORISÉES ; CommandDispatcher
// n'exécute que des commandes du registre fermé. Toutes les clés sont opaques et
// propres à l'utilisateur : une clé inconnue ou d'un autre utilisateur → not_found.

import type {
  ActionDescriptor,
  CommandRequest,
  LookupResult,
  Navigation,
  QueryRequest,
  QueryResult,
  RecordPayload,
  ViewSchema,
  WritePatch,
} from "@leila/ui-schema";
import type { ViewerContext } from "../tree.js";

export interface ViewRepository {
  navigation(viewer: ViewerContext): Promise<Navigation>;
  action(actionKey: string, viewer: ViewerContext): Promise<ActionDescriptor>;
  view(viewKey: string, viewer: ViewerContext): Promise<ViewSchema>;
  /** Invalidation explicite du cache de définitions (après mise à jour de modules ou de vues). */
  refreshCache(viewer: ViewerContext): Promise<{ cleared: number }>;
}

export interface RecordRepository {
  query(resourceKey: string, request: QueryRequest, viewer: ViewerContext): Promise<QueryResult>;
  read(resourceKey: string, id: number, viewer: ViewerContext): Promise<RecordPayload>;
  write(resourceKey: string, id: number, patch: WritePatch, viewer: ViewerContext): Promise<RecordPayload>;
  lookup(resourceKey: string, field: string, search: string, viewer: ViewerContext): Promise<LookupResult>;
}

export interface CommandDispatcher {
  execute(commandKey: string, request: CommandRequest, viewer: ViewerContext): Promise<RecordPayload>;
}

export interface UiPorts {
  views: ViewRepository;
  records: RecordRepository;
  commands: CommandDispatcher;
}
