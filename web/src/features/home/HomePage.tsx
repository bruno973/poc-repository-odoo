// features/home/HomePage.tsx — Accueil : cartes vers les écrans de l'utilisateur.
// Reprend la carte « Mes heures » du portail leila_hr. Les cartes ne sont qu'une
// présentation : chaque écran revérifie les droits (API puis Odoo).

import { Link } from "../../app/router.js";
import { useSession } from "../../app/session.js";

interface Card {
  to: string;
  icon: string;
  title: string;
  text: string;
}

const MY_HOURS: Card = { to: "/mes-presences", icon: "★", title: "Mes heures", text: "Voir mes heures de travail validées" };

const INTERNAL: Card[] = [
  { to: "/pointer", icon: "⏱", title: "Pointer", text: "Enregistrer une arrivée ou un départ" },
  { to: "/employees", icon: "👥", title: "Employés", text: "Fiches et organigramme" },
  { to: "/gestion", icon: "✔", title: "Gestion des pointages", text: "Corriger et approuver les heures" },
  { to: "/synthese", icon: "∑", title: "Synthèse", text: "Heures ventilées par pôle, service et période" },
  { to: "/app", icon: "▦", title: "Applications", text: "Écrans Odoo générés par Leila" },
];

export function HomePage() {
  const { me } = useSession();
  const cards = me?.portal ? [MY_HOURS] : [MY_HOURS, ...INTERNAL];
  return (
    <>
      <div className="head">
        <h1>Bonjour{me ? ` ${me.displayName}` : ""}</h1>
      </div>
      <div className="home-cards">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="home-card">
            <span className="home-card__icon" aria-hidden="true">
              {c.icon}
            </span>
            <span>
              <span className="home-card__title">{c.title}</span>
              <span className="home-card__text">{c.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
