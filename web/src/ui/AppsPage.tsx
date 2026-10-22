// ui/AppsPage.tsx — Applications et menus accessibles à la session (navigation générique).

import type { MenuNode } from "@leila/ui-schema";
import { Link } from "../app/router.js";
import { useApi } from "../app/useApi.js";
import { Banner } from "../layout/AppShell.js";
import { ui } from "./client.js";

export function AppsPage() {
  const nav = useApi((signal) => ui.navigation(signal), []);
  return (
    <>
      <div className="head">
        <h1>Applications</h1>
      </div>
      <p className="muted">Écrans importés automatiquement des menus auxquels tu as accès.</p>
      <Banner>{nav.error}</Banner>
      <div className="apps">
        {nav.data?.menus.map((m) => (
          <section key={m.key} className="card apps__app">
            <h2>{m.label}</h2>
            <MenuList items={m.children.length ? m.children : [m]} />
          </section>
        ))}
      </div>
    </>
  );
}

function MenuList({ items }: { items: MenuNode[] }) {
  return (
    <ul className="apps__menu">
      {items.map((m) => (
        <li key={m.key}>
          {m.actionKey && m.available ? (
            <Link className="link" to={`/app/${m.actionKey}`}>
              {m.label}
            </Link>
          ) : m.children.length ? (
            <span className="apps__folder">{m.label}</span>
          ) : (
            <span className="muted" title="Pas encore disponible dans Leila">
              {m.label} <small>(non disponible)</small>
            </span>
          )}
          {m.children.length > 0 && <MenuList items={m.children} />}
        </li>
      ))}
    </ul>
  );
}
