// features/home/HomePage.tsx — Accueil Leila One, repris du module leila_rebrand
// (action « Accueil Leila One ») : « Outils Métiers » et « Espace Employé ».
// Les cartes ne sont qu'une présentation : chaque écran revérifie les droits (API puis Odoo).
// Comptes portail : l'espace employé seulement.

import { useState } from "react";
import { Link } from "../../app/router.js";
import { useSession } from "../../app/session.js";

interface Card {
  title: string;
  icon: string;
  /** Glyphe de secours si l'image de la marque n'est pas installée */
  fallback: string;
  to?: string;
  href?: string;
}

const ODOO_URL = import.meta.env.VITE_ODOO_URL?.replace(/\/$/, "");
const LEILA_APP_URL = import.meta.env.VITE_LEILA_APP_URL ?? "https://amg.leila.one";

const EMPLOYEE_SPACE: Card[] = [{ title: "Relevé d'heures", icon: "Icone_Time_Tracking", fallback: "🕘", to: "/mes-presences" }];

function businessTools(admin: boolean): Card[] {
  return [
    { title: "Employés", icon: "Icone_Employes", fallback: "👥", to: "/employees" },
    { title: "Présences", icon: "Icone_Presences", fallback: "✔", to: "/gestion" },
    { title: "Pointer", icon: "Icone_Time_Tracking", fallback: "⏱", to: "/pointer" },
    { title: "Synthèse", icon: "Icone_Presences", fallback: "∑", to: "/synthese" },
    { title: "Applications", icon: "Icone_Settings", fallback: "▦", to: "/app" },
    ...(admin && ODOO_URL ? [{ title: "Paramètres", icon: "Icone_Settings", fallback: "⚙", href: `${ODOO_URL}/odoo/action-base_setup.action_general_configuration` }] : []),
    { title: "Leila App", icon: "Icone_Inspection", fallback: "📋", href: LEILA_APP_URL },
  ];
}

export function HomePage() {
  const { me } = useSession();
  return (
    <div className="leila-homepage">
      <h2>Bienvenue sur Leila One</h2>
      {!me?.portal && <Section title="Outils Métiers" cards={businessTools(me?.role === "hr_admin")} />}
      <Section title="Espace Employé" cards={EMPLOYEE_SPACE} />
    </div>
  );
}

function Section({ title, cards }: { title: string; cards: Card[] }) {
  return (
    <section className="leila-homepage__section">
      <h4>{title}</h4>
      <div className="leila-homepage__cards">
        {cards.map((c) => {
          const body = (
            <>
              <BrandIcon name={c.icon} fallback={c.fallback} />
              <span className="leila-card__title">{c.title}</span>
            </>
          );
          return c.to ? (
            <Link key={c.title} to={c.to} className="leila-card">
              {body}
            </Link>
          ) : (
            <a key={c.title} href={c.href} className="leila-card" target="_blank" rel="noopener noreferrer">
              {body}
            </a>
          );
        })}
      </div>
    </section>
  );
}

/** Icône de la marque (public/leila/<nom>.webp) ; absente → glyphe de secours. */
function BrandIcon({ name, fallback }: { name: string; fallback: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <span className="leila-card__icon leila-card__icon--fallback" aria-hidden="true">
        {fallback}
      </span>
    );
  }
  return <img className="leila-card__icon" src={`/leila/${name}.webp`} alt="" onError={() => setMissing(true)} />;
}
