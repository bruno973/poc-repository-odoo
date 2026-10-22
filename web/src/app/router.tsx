// app/router.tsx — Routeur minimal (API History), sans dépendance.
// Six routes statiques ne justifient pas une bibliothèque de routage (ADR-003).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";

interface Location {
  pathname: string;
  search: string;
}

interface RouterValue {
  location: Location;
  navigate(to: string, options?: { replace?: boolean }): void;
}

const RouterContext = createContext<RouterValue | null>(null);

const current = (): Location => ({ pathname: window.location.pathname, search: window.location.search });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(current);

  useEffect(() => {
    const onPop = () => setLocation(current());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string, options: { replace?: boolean } = {}) => {
    // Chemins locaux uniquement
    if (!to.startsWith("/") || to.startsWith("//")) return;
    if (options.replace) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
    setLocation(current());
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error("useRouter hors de RouterProvider");
  return value;
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(useRouter().location.search);
}

/** Lien interne : navigation sans rechargement, clic molette / Ctrl conservés. */
export function Link({ to, className, children, ...rest }: { to: string; className?: string; children: ReactNode; "aria-current"?: "page" | undefined; "aria-label"?: string }) {
  const { navigate } = useRouter();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} className={className} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}

/** Correspondance simple : "/employees/:id" ↔ "/employees/12" → { id: "12" } */
export function match(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const a = pathname.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i] as string;
    const val = a[i] as string;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(val);
    else if (seg !== val) return null;
  }
  return params;
}
