import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { registerCompany } from "@/lib/sotygeo/users/registration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { AuthBrandPanel } from "@/components/auth-brand-panel";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Crear cuenta · SOTYGEO" },
      { name: "description", content: "Registra tu empresa en SOTYGEO y administra tu flota." },
    ],
  }),
  component: Register,
});

const EMPTY = {
  company_name: "",
  legal_name: "",
  rfc: "",
  company_phone: "",
  full_name: "",
  email: "",
  password: "",
  confirm: "",
};

function Register() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [previewVerifyPath, setPreviewVerifyPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && user) void navigate({ to: "/" });
  }, [isPending, user, navigate]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const companyValid = form.company_name.trim().length >= 2;
  const passwordMismatch = form.confirm.length > 0 && form.password !== form.confirm;
  const accountValid =
    form.full_name.trim().length >= 2 && form.email.includes("@") && form.password.length >= 10 && form.password === form.confirm;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (step === 1) {
      if (companyValid) setStep(2);
      return;
    }
    if (busy || !accountValid) return;
    setBusy(true);
    setError(null);
    try {
      const { confirm: _confirm, ...payload } = form;
      const result = await registerCompany({ data: payload });
      setSentTo(form.email);
      void result;
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <main className="grid min-h-screen lg:grid-cols-2">
        <AuthBrandPanel />
        <section className="flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <h2 className="font-display text-3xl font-semibold tracking-wide">Cuenta lista</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {`Te enviamos un correo de confirmación a ${sentTo}. Ábrelo para activar tu cuenta y después inicia sesión.`}
            </p>
            <Button asChild className="mt-4 w-full">
              <Link to="/login">Entrar ahora</Link>
            </Button>
            {previewVerifyPath ? (
              <Button asChild variant="outline" className="mt-2 w-full">
                <a href={previewVerifyPath}>Confirmar correo (opcional)</a>
              </Button>
            ) : null}
            <p className="mt-4 text-sm">
              ¿No llegó el correo? <Link to="/verificar-correo" className="underline">Solicitar un nuevo enlace</Link>
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <AuthBrandPanel />
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="font-display text-sm tracking-[0.28em] text-muted-foreground lg:hidden">SOTYGEO</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-wide">Crear nueva cuenta</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Registra tu empresa. Serás su administrador y podrás invitar a tu equipo.
          </p>
          <ol className="mt-6 mb-6 flex gap-2 text-xs" aria-label="Pasos del registro">
            <li className={step === 1 ? "font-medium text-foreground" : "text-muted-foreground"} aria-current={step === 1 ? "step" : undefined}>
              1. Empresa
            </li>
            <li aria-hidden="true" className="text-muted-foreground">
              /
            </li>
            <li className={step === 2 ? "font-medium text-foreground" : "text-muted-foreground"} aria-current={step === 2 ? "step" : undefined}>
              2. Administrador
            </li>
          </ol>

          <form className="grid gap-3" onSubmit={onSubmit} noValidate>
            {step === 1 ? (
              <>
                <Field label="Nombre de la empresa">
                  <Input autoComplete="organization" required value={form.company_name} onChange={set("company_name")} />
                </Field>
                <Field label="Razón social (opcional)">
                  <Input value={form.legal_name} onChange={set("legal_name")} />
                </Field>
                <Field label="RFC (opcional)">
                  <Input value={form.rfc} onChange={set("rfc")} maxLength={13} className="uppercase" />
                </Field>
                <Field label="Teléfono (opcional)">
                  <Input type="tel" autoComplete="tel" value={form.company_phone} onChange={set("company_phone")} />
                </Field>
                <Button type="submit" disabled={!companyValid}>
                  Continuar
                </Button>
              </>
            ) : (
              <>
                <Field label="Tu nombre">
                  <Input autoComplete="name" required value={form.full_name} onChange={set("full_name")} />
                </Field>
                <Field label="Correo">
                  <Input type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
                </Field>
                <Field label="Contraseña (mínimo 10 caracteres)">
                  <Input type="password" autoComplete="new-password" required value={form.password} onChange={set("password")} />
                </Field>
                <Field label="Confirmar contraseña">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    required
                    aria-invalid={passwordMismatch}
                    value={form.confirm}
                    onChange={set("confirm")}
                  />
                </Field>
                {passwordMismatch ? <p className="text-xs text-destructive">Las contraseñas no coinciden.</p> : null}
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={busy}>
                    Atrás
                  </Button>
                  <Button type="submit" className="flex-1" disabled={busy || !accountValid}>
                    {busy ? "Creando cuenta…" : "Crear cuenta"}
                  </Button>
                </div>
              </>
            )}
          </form>

          <p className="mt-8 text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="text-foreground underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (/too_small|too_big|invalid_string|invalid_format|RFC/i.test(msg)) {
    return "Revisa los datos: hay campos con formato inválido.";
  }
  return msg && msg.length < 140 ? msg : "No se pudo completar el registro. Intenta de nuevo.";
}
