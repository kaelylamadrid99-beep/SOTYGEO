import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { activateAccount, checkInvitation } from "@/lib/sotygeo/users/lifecycle";

export const Route = createFileRoute("/activate")({
  validateSearch: (s: Record<string, unknown>): { token?: string } =>
    typeof s.token === "string" && s.token ? { token: s.token } : {},
  component: Activate,
});

type Info = { company: string; email: string; role: string; name: string };

function Activate() {
  const search = Route.useSearch();
  // El token se captura en memoria y se quita de la URL visible.
  const [token] = useState(() => search.token ?? "");
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<"loading" | "invalid" | "ready" | "done">("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.has("token")) {
      u.searchParams.delete("token");
      window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}${u.hash}`);
    }
  }, []);

  useEffect(() => {
    if (!token) return setState("invalid");
    checkInvitation({ data: { token } })
      .then((r) => { setInfo(r); setState("ready"); })
      .catch(() => setState("invalid"));
  }, [token]);

  async function submit() {
    setError(null);
    if (password.length < 10) return setError("La contraseña debe tener al menos 10 caracteres");
    if (password !== confirm) return setError("Las contraseñas no coinciden");
    setBusy(true);
    try {
      await activateAccount({ data: { token, password } });
      setState("done");
    } catch {
      setError("Invitación inválida o expirada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-4 px-4">
      <p className="text-center font-display text-2xl font-semibold tracking-[0.28em]">SOTYGEO</p>
      {state === "loading" && <p className="text-center text-sm text-muted-foreground">Validando invitación…</p>}
      {state === "invalid" && (
        <p className="rounded-xl border border-border p-4 text-center text-sm">
          Invitación inválida o expirada. Pide a tu administrador que te la reenvíe.
        </p>
      )}
      {state === "ready" && info && (
        <div className="grid gap-3">
          <h1 className="text-center font-display text-xl font-semibold">Activar cuenta</h1>
          <p className="text-sm">Empresa: <b>{info.company}</b><br />Correo: <b>{info.email}</b><br />Rol: <b>{info.role}</b></p>
          <Field label="Nueva contraseña"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Confirmar contraseña"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy} onClick={() => void submit()}>ACTIVAR CUENTA</Button>
        </div>
      )}
      {state === "done" && (
        <div className="grid gap-3 text-center">
          <p className="text-sm">Tu cuenta fue activada. Si ya tenías cuenta en SOTYGEO, usa tu contraseña actual.</p>
          <Button asChild><Link to="/login">INICIAR SESIÓN</Link></Button>
        </div>
      )}
    </div>
  );
}
