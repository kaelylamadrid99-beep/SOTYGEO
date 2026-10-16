import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { requestPasswordReset } from "@/lib/sotygeo/users/passwords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";

export const Route = createFileRoute("/recuperar")({ component: Recover });

function Recover() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset({ data: { email } });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm">
        <p className="font-display text-sm tracking-[0.28em] text-muted-foreground">SOTYGEO</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-wide">Recuperar acceso</h1>
        <p className="mt-2 mb-6 text-sm text-muted-foreground">
          Si el correo existe, te enviamos un enlace para restablecer tu contraseña, válido por 1 hora.
        </p>
        {done ? (
          <p className="text-sm text-success">Solicitud registrada. Revisa tu bandeja o contacta al administrador.</p>
        ) : (
          <div className="grid gap-3">
            <Field label="Correo">
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </Field>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <Button disabled={busy || !email} onClick={() => void submit()}>
              {busy ? "Enviando…" : "Enviar solicitud"}
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
