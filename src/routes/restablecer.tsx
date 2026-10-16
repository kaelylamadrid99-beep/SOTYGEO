import { createFileRoute, Link } from "@tanstack/react-router";
import { useLayoutEffect, useState } from "react";
import { completePasswordReset } from "@/lib/sotygeo/users/passwords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";

export const Route = createFileRoute("/restablecer")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    const token = typeof search.token === "string" ? search.token : "";
    return token ? { token } : {};
  },
  component: Restablecer,
});

function tokenFromLocation(searchToken: string): string {
  if (typeof window !== "undefined") {
    try {
      const fromUrl = new URL(window.location.href).searchParams.get("token");
      if (fromUrl) return fromUrl;
    } catch {
      /* ignore malformed location */
    }
  }
  return searchToken;
}

function stripTokenFromVisibleUrl() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}

function Restablecer() {
  const search = Route.useSearch();
  const [token] = useState(() => tokenFromLocation(search.token ?? ""));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    stripTokenFromVisibleUrl();
  }, []);

  async function submit() {
    if (!token) return;
    if (password.length < 10) {
      setError("La contraseña debe tener al menos 10 caracteres");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completePasswordReset({ data: { token, password } });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo restablecer la contraseña");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm">
        <p className="font-display text-sm tracking-[0.28em] text-muted-foreground">SOTYGEO</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-wide">Nueva contraseña</h1>

        {!token ? (
          <p className="mt-4 text-sm text-destructive">
            Enlace inválido. Solicita uno nuevo desde{" "}
            <Link to="/recuperar" className="underline">
              recuperar acceso
            </Link>
            .
          </p>
        ) : done ? (
          <div className="mt-4">
            <p className="text-sm text-success">Contraseña actualizada. Ya puedes iniciar sesión.</p>
            <Link to="/login" className="mt-4 inline-block text-xs text-muted-foreground hover:text-foreground">
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            <Field label="Nueva contraseña">
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirmar contraseña">
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </Field>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <Button disabled={busy || !password || !confirm} onClick={() => void submit()}>
              {busy ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </div>
        )}

        <Link to="/login" className="mt-6 inline-block text-xs text-muted-foreground hover:text-foreground">
          Volver al inicio de sesión
        </Link>
      </div>
    </main>
  );
}
