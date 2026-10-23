// layout/Navigation.tsx — Barre de navigation : écrans, identité constatée, déconnexion.

import { Link, useRouter } from "../app/router.js";
import { useSession } from "../app/session.js";
import type { ViewerRole } from "../types/domain.js";

export const ROLE_LABEL: Record<ViewerRole, string> = {
  employee: "Employé",
  manager: "Manager",
  hr_admin: "Admin RH",
};

const PORTAL_LINKS = [
  { href: "/accueil", label: "Accueil" },
  { href: "/mes-presences", label: "Mes heures" },
] as const;

const LINKS = [
  { href: "/accueil", label: "Accueil" },
  { href: "/mes-presences", label: "Mes heures" },
  { href: "/employees", label: "Employés" },
  { href: "/pointer", label: "Pointer" },
  { href: "/gestion", label: "Gestion" },
  { href: "/synthese", label: "Synthèse" },
  { href: "/app", label: "Applications" },
] as const;

export function Navigation() {
  const { location } = useRouter();
  const { me, logout } = useSession();
  return (
    <header className="appnav">
      <Link className="appnav__brand" to="/accueil">
        Leila One <span>PoC</span>
      </Link>
      <nav className="appnav__links" aria-label="Navigation principale">
        {(me?.portal ? PORTAL_LINKS : LINKS).map((l) => (
          <Link key={l.href} to={l.href} aria-current={location.pathname.startsWith(l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      {me && (
        <div className="appnav__meta">
          <span className="appnav__who">{me.displayName}</span>
          <span className="appnav__role" title="Rôle constaté à partir des groupes de l'utilisateur">
            {me.portal ? "Portail" : ROLE_LABEL[me.role]}
          </span>
          <button type="button" className="appnav__logout" onClick={() => void logout()}>
            Se déconnecter
          </button>
        </div>
      )}
    </header>
  );
}
