import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { GROK_PROVIDERS, authClient, useOAuthEnabled, signIn, setBearerToken } from "@/lib/auth/client";
import { recordLogin, recordLoginFailure } from "@/lib/sotygeo/users/login-audit";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { AuthBrandPanel } from "@/components/auth-brand-panel";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar · SOTYGEO" },
      { name: "description", content: "Accede al centro de control de tu flota en SOTYGEO." },
    ],
  }),
  component: Login,
});

function Login() {
  const { user, isPending } = useCurrentUserState();
  const showOAuth = useOAuthEnabled();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPending && user) void navigate({ to: "/" });
  }, [isPending, user, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { data: signInData, error: err } = await authClient.signIn.email({
        email,
        password,
        // Avoid Better Auth redirect; we control navigation after session is confirmed.
        callbackURL: "/",
      });
      if (err) {
        void recordLoginFailure({ data: { email } }).catch(() => undefined);
        throw new Error(
          err.code === "INVALID_ORIGIN" || /origin/i.test(err.message ?? "")
            ? "Este dominio no está autorizado para iniciar sesión. Contacta al soporte."
            : "Correo o contraseña incorrectos",
        );
      }
      // Prefer token from the sign-in payload when the Set-Auth-Token header was
      // already consumed; keeps server functions authenticated without cookies.
      const tokenFromBody =
        signInData && typeof signInData === "object" && "token" in signInData
          ? (signInData as { token?: string | null }).token
          : null;
      if (tokenFromBody && typeof window !== "undefined") {
        setBearerToken(tokenFromBody);
      }
      // Confirma sesión legible (cookie y/o bearer). Reintento corto: en preview
      // el cookie cache a veces tarda un tick en sincronizar.
      let session: { user?: unknown } | null = null;
      for (let i = 0; i < 3; i++) {
        const res = await authClient
          .getSession({ query: { disableCookieCache: true } })
          .catch(() => ({ data: null }));
        session = res.data ?? null;
        if (session?.user) break;
        await new Promise((r) => setTimeout(r, 120 * (i + 1)));
      }
      if (!session?.user) {
        throw new Error(
          "Las credenciales son correctas, pero no se pudo establecer la sesión. Recarga la página, permite cookies de este sitio y vuelve a intentar. Si usas HTTP fuera de localhost, configura HTTPS y BETTER_AUTH_URL.",
        );
      }
      const r = await recordLogin().catch(() => ({ allowed: true, pending: false }));
      if (!r.allowed) {
        await authClient.signOut().catch(() => undefined);
        setBearerToken(null);
        throw new Error(
          r.pending
            ? "Confirma tu correo para activar la cuenta. Revisa tu bandeja o solicita un nuevo enlace en /verificar-correo."
            : "Tu cuenta no está activa. Contacta a tu administrador.",
        );
      }
      // Soft navigation so the SPA keeps the bearer in memory; hard reload as fallback.
      try {
        await navigate({ to: "/" });
      } catch {
        window.location.href = "/";
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <AuthBrandPanel />
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="font-display text-sm tracking-[0.28em] text-muted-foreground lg:hidden">SOTYGEO</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-wide">Entrar</h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">Abre el centro de control de la flota.</p>
          {showOAuth ? (
            <>
              <div className="grid gap-2">
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      try {
                        await signIn(p.providerId, { callbackURL: "/" });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
                      }
                    }}
                  >
                    Continuar con {p.label}
                  </Button>
                ))}
              </div>
              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                correo
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}
          <form className="grid gap-3" onSubmit={onSubmit} noValidate>
            <Field label="Correo">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Contraseña">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy || !email || !password}>
              {busy ? "Entrando…" : "Entrar"}
            </Button>
            <Link to="/recuperar" className="text-xs text-muted-foreground hover:text-foreground">
              Recuperar contraseña
            </Link>
          </form>
          <div className="mt-8 border-t border-border pt-6 text-sm">
            <p className="text-muted-foreground">¿Tu empresa aún no usa SOTYGEO?</p>
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link to="/register">Crear nueva cuenta</Link>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              ¿Te invitaron? Usa el enlace de tu correo para activar tu acceso.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
