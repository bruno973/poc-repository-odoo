// features/employees/EmployeePage.tsx — Fiche employé (élaguée et calculée par l'API).

import { useEffect, useState } from "react";
import { api } from "../../app/api-client.js";
import { Link } from "../../app/router.js";
import { useApi } from "../../app/useApi.js";
import { Banner } from "../../layout/AppShell.js";
import type { EmployeeFormRecord, OrgChartNode } from "../../types/domain.js";
import { Avatar } from "./EmployeesPage.js";
import { TreeForm } from "./TreeForm.js";

export function EmployeePage({ id }: { id: string }) {
  const loaded = useApi((signal) => api.get<EmployeeFormRecord>(`/api/employees/${encodeURIComponent(id)}`, {}, signal), [id]);
  const [record, setRecord] = useState<EmployeeFormRecord | null>(null);
  useEffect(() => setRecord(loaded.data), [loaded.data]);

  return (
    <div className="narrow">
      <Link className="link back" to="/employees">
        ← Retour à l'annuaire
      </Link>
      <Banner>{loaded.error}</Banner>
      {loaded.loading && !record && <p className="muted">Chargement…</p>}
      {record && (
        <>
          <div className="card hero">
            <Avatar name={record.headerSummary.fullName} photo={record.headerSummary.photo} size={72} />
            <div>
              <h1>{record.headerSummary.fullName}</h1>
              {record.headerSummary.jobTitle && <div className="muted">{record.headerSummary.jobTitle}</div>}
              {record.headerSummary.department && <span className="chip">{record.headerSummary.department.label}</span>}
              {record.headerSummary.workEmail && <div className="hero__email">{record.headerSummary.workEmail}</div>}
            </div>
          </div>
          <div className="card form-card">
            <TreeForm key={record.id} record={record} onSaved={setRecord} />
          </div>
          {record.orgChart && (
            <div className="card form-card">
              <h2 className="section-title">Organigramme</h2>
              <div className="orgchart">
                <OrgNode node={record.orgChart} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OrgNode({ node }: { node: OrgChartNode }) {
  return (
    <div className="org-node">
      <Link to={`/employees/${node.id}`} className="org-node__card">
        <Avatar name={node.fullName} photo={node.photo} size={40} />
        <span>
          <strong>{node.fullName}</strong>
          {node.jobTitle && <small>{node.jobTitle}</small>}
        </span>
      </Link>
      {node.children.length > 0 && (
        <div className="org-node__children">
          {node.children.map((c) => (
            <OrgNode key={c.id} node={c} />
          ))}
        </div>
      )}
    </div>
  );
}
