import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { resendEmailVerification, verifyEmail } from "@/lib/sotygeo/users/email-verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";

export const Route = createFileRoute("/verificar-correo")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    const token = typeof search.token === "string" ? search.token : "";
    return token ? { token } : {};
  },
  component: VerificarCorreo,
});

function VerificarCorreo() {
  const search = Route.useSearch();
  const [state, setState] = useState<"idle" | "working" | "ok" | "error">(search.token ? "working" : "idle");
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = search.token;
    if (!token) return;
    let cancelled = false;
    verifyEmail({ data: { token } })
      .then(() => {
        if (cancelled) return;
        setState("ok");
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("token");
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [search.token]);

  async function resend(e: FormEvent) {
    e.preventDefault();
    if (busy || !email) return;
    setBusy(true);
    try {
      await resendEmailVerification({ data: { email } });
    } catch {
      /* respuesta uniforme */
    } finally {
      setResent(true);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm">
        <p className="font-display text-sm tracking-[0.28em] text-muted-foreground">SOTYGEO</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-wide">Confirmar correo</h1>
        {state === "working" ? <p className="mt-4 text-sm text-muted-foreground">Verificando…</p> : null}
        {state === "ok" ? (
          <>
            <p className="mt-4 text-sm">Correo confirmado. Tu cuenta ya está activa.</p>
            <Button asChild className="mt-4 w-full">
              <Link to="/login">Entrar</Link>
            </Button>
          </>
        ) : null}
        {state === "idle" || state === "error" ? (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              {state === "error"
                ? "El enlace es inválido o expiró. Solicita uno nuevo."
                : "Revisa tu correo y abre el enlace de confirmación, o solicita uno nuevo."}
            </p>
            {resent ? (
              <p className="mt-4 text-sm">Si existe una cuenta pendiente con ese correo, enviamos un nuevo enlace.</p>
            ) : (
              <form className="mt-4 grid gap-3" onSubmit={resend}>
                <Field label="Correo">
                  <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Button type="submit" disabled={busy || !email}>
                  Reenviar enlace
                </Button>
              </form>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
