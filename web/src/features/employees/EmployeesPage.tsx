// features/employees/EmployeesPage.tsx — Annuaire groupé par département + recherche.

import { useState, type FormEvent } from "react";
import { api } from "../../app/api-client.js";
import { Link, useRouter, useSearchParams } from "../../app/router.js";
import { useApi } from "../../app/useApi.js";
import { Banner } from "../../layout/AppShell.js";
import type { DepartmentNode, EmployeeListResult, EmployeeSummary } from "../../types/domain.js";

export function EmployeesPage() {
  const params = useSearchParams();
  const { navigate } = useRouter();
  const search = params.get("search") ?? "";
  const departmentId = params.get("departmentId") ?? "";
  const [draft, setDraft] = useState(search);

  const list = useApi(
    (signal) => api.get<EmployeeListResult>("/api/employees", { search, departmentId }, signal),
    [search, departmentId],
  );
  const departments = useApi((signal) => api.get<DepartmentNode[]>("/api/departments/tree", {}, signal), []);

  const apply = (next: { search?: string; departmentId?: string }) => {
    const q = new URLSearchParams();
    const s = next.search ?? search;
    const d = next.departmentId ?? departmentId;
    if (s) q.set("search", s);
    if (d) q.set("departmentId", d);
    navigate(`/employees${q.size ? `?${q}` : ""}`);
  };

  const byDept = new Map<string, EmployeeSummary[]>();
  for (const emp of list.data?.items ?? []) {
    const label = emp.department?.label ?? "Sans département";
    byDept.set(label, [...(byDept.get(label) ?? []), emp]);
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Annuaire des employés</h1>
          {list.data && (
            <p className="muted">
              {list.data.total} employé{list.data.total > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      <form
        className="toolbar search-bar"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          apply({ search: draft });
        }}
      >
        <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Rechercher par nom, poste, email…" aria-label="Rechercher" />
        <select value={departmentId} onChange={(e) => apply({ departmentId: e.target.value })} aria-label="Département">
          <option value="">Tous les départements</option>
          {(departments.data ?? []).map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Rechercher
        </button>
        {(search || departmentId) && (
          <Link className="link" to="/employees">
            Réinitialiser
          </Link>
        )}
      </form>

      <Banner>{list.error}</Banner>
      {list.loading && !list.data && <p className="muted">Chargement…</p>}
      {list.data && byDept.size === 0 && <p className="muted">Aucun employé trouvé.</p>}
      {[...byDept.entries()].map(([dept, employees]) => (
        <section className="dept" key={dept}>
          <h2 className="dept__title">
            {dept} ({employees.length})
          </h2>
          <div className="kanban">
            {employees.map((emp) => (
              <Link key={emp.id} to={`/employees/${emp.id}`} className="emp-card">
                <Avatar name={emp.fullName} photo={emp.photo} />
                <div className="emp-card__info">
                  <div className="emp-card__name">{emp.fullName}</div>
                  {emp.jobTitle && <div className="emp-card__title">{emp.jobTitle}</div>}
                  {emp.workEmail && <div className="emp-card__email">{emp.workEmail}</div>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function Avatar({ name, photo, size = 48 }: { name: string; photo: string | null; size?: number }) {
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {photo ? <img src={photo} alt="" /> : name.charAt(0).toUpperCase()}
    </div>
  );
}
