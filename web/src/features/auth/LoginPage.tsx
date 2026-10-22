// features/auth/LoginPage.tsx — Connexion avec les identifiants Odoo (identité réelle).
// Le mot de passe va du navigateur à l'API, qui le passe à Odoo et l'oublie.

import { useState, type FormEvent } from "react";
import { safeReturn } from "../../app/api-client.js";
import { useRouter, useSearchParams } from "../../app/router.js";
import { useSession } from "../../app/session.js";

export function LoginPage() {
  const { login, authMode } = useSession();
  const { navigate } = useRouter();
  const retour = safeReturn(useSearchParams().get("retour"));
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(user, password);
      navigate(retour, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setPassword("");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="login">
      <form className="card login__card" onSubmit={(e) => void submit(e)}>
        <h1>Leila One</h1>
        <p className="muted">
          {authMode === "fake-jwt"
            ? "Démo sans Odoo : abigail, bruno ou camille (mot de passe demo)."
            : "Connecte-toi avec ton identifiant et ton mot de passe Odoo."}
        </p>
        {authMode === "shared" && (
          <p className="banner is-error">L'API tourne en mode comptes partagés (tests uniquement) : la connexion est indisponible.</p>
        )}
        {error && (
          <p className="banner is-error" role="alert">
            {error}
          </p>
        )}
        <label>
          Identifiant
          <input name="login" autoComplete="username" required value={user} onChange={(e) => setUser(e.target.value)} autoFocus />
        </label>
        <label>
          Mot de passe
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
