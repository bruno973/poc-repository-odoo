// app/routes.tsx — Table des écrans et protection des routes.

import { useEffect, type ReactNode } from "react";
import { AttendanceKioskPage } from "../features/attendance/AttendanceKioskPage.js";
import { AttendanceManagementPage } from "../features/attendance/AttendanceManagementPage.js";
import { LoginPage } from "../features/auth/LoginPage.js";
import { HomePage } from "../features/home/HomePage.js";
import { MyTimesheetPage } from "../features/timesheet/MyTimesheetPage.js";
import { EmployeePage } from "../features/employees/EmployeePage.js";
import { EmployeesPage } from "../features/employees/EmployeesPage.js";
import { SummaryPage } from "../features/summary/SummaryPage.js";
import { AppShell } from "../layout/AppShell.js";
import { ActionManager } from "../ui/ActionManager.js";
import { AppsPage } from "../ui/AppsPage.js";
import { match, useRouter } from "./router.js";
import { loginPath, useSession } from "./session.js";

interface Route {
  path: string;
  title: string;
  render(params: Record<string, string>): ReactNode;
}

/** Écrans proposés aux comptes portail (les autres seraient refusés par Odoo de toute façon). */
const PORTAL_PATHS = new Set(["/accueil", "/mes-presences"]);

const ROUTES: Route[] = [
  { path: "/accueil", title: "Accueil", render: () => <HomePage /> },
  { path: "/mes-presences", title: "Mes pointages", render: () => <MyTimesheetPage /> },
  { path: "/employees", title: "Employés", render: () => <EmployeesPage /> },
  { path: "/employees/:id", title: "Fiche employé", render: (p) => <EmployeePage id={p["id"] ?? ""} /> },
  { path: "/pointer", title: "Pointer", render: () => <AttendanceKioskPage /> },
  { path: "/gestion", title: "Gestion", render: () => <AttendanceManagementPage /> },
  { path: "/synthese", title: "Synthèse", render: () => <SummaryPage /> },
  // Écrans génériques (Leila UI Schema) : navigation importée, aucune page par écran
  { path: "/app", title: "Applications", render: () => <AppsPage /> },
  { path: "/app/:actionKey", title: "Application", render: (p) => <ActionManager key={p["actionKey"]} actionKey={p["actionKey"] ?? ""} recordId={null} /> },
  {
    path: "/app/:actionKey/:id",
    title: "Fiche",
    render: (p) => <ActionManager key={p["actionKey"]} actionKey={p["actionKey"] ?? ""} recordId={Number(p["id"]) || null} />,
  },
];

function Redirect({ to }: { to: string }) {
  const { navigate } = useRouter();
  useEffect(() => navigate(to, { replace: true }), [navigate, to]);
  return null;
}

export function Routes() {
  const { location } = useRouter();
  const { status, me } = useSession();
  const { pathname, search } = location;

  if (pathname === "/login") return status === "authenticated" ? <Redirect to="/accueil" /> : <LoginPage />;
  if (status === "loading") return <p className="page muted">Chargement…</p>;
  // Route protégée : sans session, connexion puis retour ici
  if (status === "anonymous") return <Redirect to={loginPath(pathname, search)} />;
  if (pathname === "/") return <Redirect to="/accueil" />;
  // Compte portail : accueil et mes présences seulement (présentation ; l'API et Odoo refusent le reste)
  if (me?.portal && !PORTAL_PATHS.has(pathname)) return <Redirect to="/accueil" />;

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
