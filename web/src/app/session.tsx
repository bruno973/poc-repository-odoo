// app/session.tsx — Session de l'utilisateur côté React.
//
// L'identité vient TOUJOURS de l'API (/api/auth/me, à partir du cookie httpOnly) :
// le front ne stocke ni jeton ni rôle. Le rôle sert à la présentation, jamais à
// autoriser (les droits sont appliqués par l'API et Odoo à chaque appel).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicIdentity } from "../types/domain.js";
import { api, ApiError, onUnauthenticated } from "./api-client.js";
import { useRouter } from "./router.js";

type AuthMode = "odoo-session" | "fake-jwt" | "shared";

interface SessionValue {
  status: "loading" | "anonymous" | "authenticated";
  me: PublicIdentity | null;
  authMode: AuthMode | null;
  login(login: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function loginPath(pathname: string, search: string): string {
  return `/login?retour=${encodeURIComponent(pathname + search)}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { navigate } = useRouter();
  const [me, setMe] = useState<PublicIdentity | null>(null);
  const [status, setStatus] = useState<SessionValue["status"]>("loading");
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<PublicIdentity>("/api/auth/me"));
      setStatus("authenticated");
    } catch {
      setMe(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void api
      .get<{ authMode: AuthMode }>("/api/meta")
      .then((m) => setAuthMode(m.authMode))
      .catch(() => setAuthMode(null));
    void refresh();
  }, [refresh]);

  // Session expirée en cours de navigation (F-08) : retour à la connexion, sans message technique.
  useEffect(
    () =>
      onUnauthenticated(() => {
        setMe(null);
        setStatus("anonymous");
        if (window.location.pathname !== "/login") {
          navigate(loginPath(window.location.pathname, window.location.search), { replace: true });
        }
      }),
    [navigate],
  );

  const login = useCallback(
    async (user: string, password: string) => {
      try {
        await api.post("/api/auth/login", { login: user, password });
      } catch (error) {
        if (error instanceof ApiError && error.status === 429) throw new Error("Trop de tentatives : réessaie dans une minute.");
        if (error instanceof ApiError && error.status === 401) throw new Error("Identifiant ou mot de passe incorrect.");
        throw new Error("Connexion impossible pour le moment.");
      }
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    setMe(null);
    setStatus("anonymous");
    navigate("/login", { replace: true });
  }, [navigate]);

  return <SessionContext.Provider value={{ status, me, authMode, login, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession hors de SessionProvider");
  return value;
}
