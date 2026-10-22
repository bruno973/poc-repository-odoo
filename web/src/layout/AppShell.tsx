// layout/AppShell.tsx — Gabarit des écrans connectés.

import type { ReactNode } from "react";
import { Navigation } from "./Navigation.js";
import { TraceDrawer } from "./TraceDrawer.js";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Navigation />
      <main className="page">{children}</main>
      <TraceDrawer />
    </>
  );
}

export function Banner({ kind = "error", children }: { kind?: "error" | "ok"; children: ReactNode }) {
  if (!children) return null;
  return (
    <p className={`banner is-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
