// ui/ActionManager.tsx — Ouvre une action générique (clé opaque) : liste + recherche,
// puis fiche d'un enregistrement. Ne connaît ni modèle ni champ.

import type { ActionDescriptor, RecordPayload, ViewSchema } from "@leila/ui-schema";
import { useEffect, useState } from "react";
import { Link, useRouter } from "../app/router.js";
import { useApi } from "../app/useApi.js";
import { Banner } from "../layout/AppShell.js";
import { ui } from "./client.js";
import { DiagnosticsPanel } from "./diagnostics/DiagnosticsPanel.js";
import { FormRenderer } from "./renderers/FormRenderer.js";
import { ListRenderer } from "./renderers/ListRenderer.js";
import { SearchRenderer, type SearchState } from "./renderers/SearchRenderer.js";

export function ActionManager({ actionKey, recordId }: { actionKey: string; recordId: number | null }) {
  const action = useApi((signal) => ui.action(actionKey, signal), [actionKey]);
  if (action.error) return <Banner>{action.error}</Banner>;
  if (!action.data) return <p className="muted">Chargement…</p>;
  const a = action.data;
  if (!a.available) {
    return (
      <>
        <h1>{a.title}</h1>
        <p className="banner is-error">Cette fonctionnalité n'est pas encore disponible dans Leila.</p>
        <DiagnosticsPanel diagnostics={a.diagnostics} />
        <Link className="link" to="/app">
          ← Retour aux applications
        </Link>
      </>
    );
  }
  return recordId === null ? <ListMode action={a} /> : <RecordMode action={a} recordId={recordId} />;
}

function ListMode({ action }: { action: ActionDescriptor }) {
  const { navigate } = useRouter();
  const views = useApi(
    async (signal) => {
      const [list, search] = await Promise.all([
        action.views.list ? ui.view(action.views.list, signal) : null,
        action.views.search ? ui.view(action.views.search, signal) : null,
      ]);
      return { list, search };
    },
    [action.actionKey],
  );
  // Filtres par défaut de l'action (search_default_* d'Odoo), modifiables ensuite
  const [search, setSearch] = useState<SearchState>({ filters: action.defaultFilters ?? [], search: [], groupBy: action.defaultGroupBy });
  if (views.error) return <Banner>{views.error}</Banner>;
  if (!views.data) return <p className="muted">Chargement…</p>;
  const { list, search: searchView } = views.data;
  return (
    <>
      <div className="head">
        <h1>{action.title}</h1>
      </div>
      {searchView && <SearchRenderer view={searchView} value={search} onChange={setSearch} />}
      {list ? <ListRenderer view={list} search={search} onOpen={(id) => navigate(`/app/${action.actionKey}/${id}`)} /> : <p className="muted">Pas de vue liste.</p>}
      <DiagnosticsPanel diagnostics={[...(list?.diagnostics ?? []), ...(searchView?.diagnostics ?? [])]} />
    </>
  );
}

function RecordMode({ action, recordId }: { action: ActionDescriptor; recordId: number }) {
  const loaded = useApi(
    async (signal) => {
      if (!action.views.form) throw new Error("Pas de vue fiche.");
      const [view, record] = await Promise.all([ui.view(action.views.form, signal), ui.read(action.resourceKey, recordId, signal)]);
      return { view, record };
    },
    [action.actionKey, recordId],
  );
  const [state, setState] = useState<{ view: ViewSchema; record: RecordPayload } | null>(null);
  useEffect(() => setState(loaded.data), [loaded.data]);

  return (
    <div className="narrow">
      <Link className="link back" to={`/app/${action.actionKey}`}>
        ← {action.title}
      </Link>
      <Banner>{loaded.error}</Banner>
      {!state && !loaded.error && <p className="muted">Chargement…</p>}
      {state && (
        <>
          {!state.record.access.canEdit && <p className="muted ui-readonly-note">Lecture seule : tu n'as pas le droit de modifier cet enregistrement.</p>}
          <div className="card form-card">
            <FormRenderer key={state.record.id} view={state.view} record={state.record} onChange={(record) => setState({ ...state, record })} />
          </div>
          <DiagnosticsPanel diagnostics={state.view.diagnostics} />
        </>
      )}
    </div>
  );
}
