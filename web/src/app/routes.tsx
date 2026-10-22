// app/routes.tsx — Table des écrans et protection des routes.

import { useEffect, type ReactNode } from "react";
import { AttendanceKioskPage } from "../features/attendance/AttendanceKioskPage.js";
import { AttendanceManagementPage } from "../features/attendance/AttendanceManagementPage.js";
import { LoginPage } from "../features/auth/LoginPage.js";
import { EmployeePage } from "../features/employees/EmployeePage.js";
import { EmployeesPage } from "../features/employees/EmployeesPage.js";
import { SummaryPage } from "../features/summary/SummaryPage.js";
import { AppShell } from "../layout/AppShell.js";
import { match, useRouter } from "./router.js";
import { loginPath, useSession } from "./session.js";

interface Route {
  path: string;
  title: string;
  render(params: Record<string, string>): ReactNode;
}

const ROUTES: Route[] = [
  { path: "/employees", title: "Employés", render: () => <EmployeesPage /> },
  { path: "/employees/:id", title: "Fiche employé", render: (p) => <EmployeePage id={p["id"] ?? ""} /> },
  { path: "/pointer", title: "Pointer", render: () => <AttendanceKioskPage /> },
  { path: "/gestion", title: "Gestion", render: () => <AttendanceManagementPage /> },
  { path: "/synthese", title: "Synthèse", render: () => <SummaryPage /> },
];

function Redirect({ to }: { to: string }) {
  const { navigate } = useRouter();
  useEffect(() => navigate(to, { replace: true }), [navigate, to]);
  return null;
}

export function Routes() {
  const { location } = useRouter();
  const { status } = useSession();
  const { pathname, search } = location;

  if (pathname === "/login") return status === "authenticated" ? <Redirect to="/employees" /> : <LoginPage />;
  if (status === "loading") return <p className="page muted">Chargement…</p>;
  // Route protégée : sans session, connexion puis retour ici
  if (status === "anonymous") return <Redirect to={loginPath(pathname, search)} />;
  if (pathname === "/") return <Redirect to="/employees" />;

  for (const route of ROUTES) {
    const params = match(route.path, pathname);
    if (params) {
      document.title = `${route.title} · Leila One`;
      return <AppShell>{route.render(params)}</AppShell>;
    }
  }
  return (
    <AppShell>
      <h1>Page introuvable</h1>
      <p className="muted">Cette adresse ne correspond à aucun écran de Leila.</p>
    </AppShell>
  );
}
