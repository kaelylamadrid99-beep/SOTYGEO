import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { listClients, listDrivers, listPersonnel, upsertPersonnel } from "@/lib/sotygeo/api";
import { changeUserRole, inviteUser, listUsers, resendInvitation, revokeInvitation, setUserStatus } from "@/lib/sotygeo/users/lifecycle";
import { ROLE_LABEL, fmtDate } from "@/lib/sotygeo/format";
import type { Personnel, Role } from "@/lib/sotygeo/types";

export const Route = createFileRoute("/usuarios")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["personnel"], queryFn: () => listPersonnel() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Personnel> & { full_name: string; role: Role }>({
    full_name: "", role: "OPERADOR", status: "ACTIVE",
  });
  const save = useMutation({
    mutationFn: () => upsertPersonnel({ data: form }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["personnel"] });
    },
  });

  const users = useQuery({ queryKey: ["users-lifecycle"], queryFn: () => listUsers() });
  const drivers = useQuery({ queryKey: ["drivers-pick"], queryFn: () => listDrivers() });
  const clients = useQuery({ queryKey: ["clients-pick"], queryFn: () => listClients() });
  const [invOpen, setInvOpen] = useState(false);
  const [invErr, setInvErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [inv, setInv] = useState<{ full_name: string; email: string; phone: string; role: Role; driver_id?: string; client_id?: string }>({ full_name: "", email: "", phone: "", role: "OPERADOR" });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["users-lifecycle"] });
  const onErr = (e: unknown) => setActionErr(e instanceof Error ? e.message : "Error");
  const invite = useMutation({
    mutationFn: () => inviteUser({ data: { ...inv, driver_id: inv.role === "CONDUCTOR" ? inv.driver_id : undefined, client_id: inv.role === "CLIENTE" ? inv.client_id : undefined } }),
    onSuccess: (r) => { setInvOpen(false); setActionErr(r.emailSent ? null : "Usuario creado. No fue posible enviar el correo: usa «Reintentar envío»."); refresh(); },
    onError: (e) => setInvErr(e instanceof Error ? e.message : "Datos no válidos"),
  });
  const resend = useMutation({ mutationFn: (id: string) => resendInvitation({ data: { id } }), onSuccess: refresh, onError: onErr });
  const revoke = useMutation({ mutationFn: (id: string) => revokeInvitation({ data: { id } }), onSuccess: refresh, onError: onErr });
  const status = useMutation({ mutationFn: (v: { user_id: string; status: "ACTIVE" | "DISABLED" }) => setUserStatus({ data: v }), onSuccess: refresh, onError: onErr });
  const role = useMutation({ mutationFn: (v: { user_id: string; role: Role }) => changeUserRole({ data: v }), onSuccess: refresh, onError: onErr });

  return (
    <div>
      <PageHeader kicker="Administración" title="Usuarios y personal" description="Roles ADMIN, OPERADOR, SUPERVISOR, CONDUCTOR y CLIENTE." actions={
        <Button onClick={() => { setForm({ full_name: "", role: "OPERADOR", status: "ACTIVE" }); setOpen(true); }}>Nuevo</Button>
      } />
      <p className="mb-4 text-sm text-muted-foreground">
        Sesión actual: {data.data?.workspace.profile.full_name} · {data.data ? ROLE_LABEL[data.data.workspace.profile.role] : ""}
      </p>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Puesto</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(data.data?.people ?? []).map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{p.full_name}</td>
                <td className="px-3 py-2">{p.position}</td>
                <td className="px-3 py-2">{ROLE_LABEL[p.role]}</td>
                <td className="px-3 py-2"><StatusBadge value={p.status} /></td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setForm(p); setOpen(true); }}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 font-display text-xl font-semibold tracking-wide">Cuentas de acceso</h2>
      <div className="mt-3 flex justify-end"><Button onClick={() => { setInv({ full_name: "", email: "", phone: "", role: "OPERADOR" }); setInvErr(null); setInvOpen(true); }}>+ Nuevo usuario</Button></div>
      <ul className="mt-3 space-y-2 text-sm">
        {(users.data?.invitations ?? []).map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
            <span><b>{i.full_name}</b> · {i.email} · {ROLE_LABEL[i.role]}<br /><StatusBadge value={i.state === "INVITED" ? "INVITADO" : i.state === "EXPIRED" ? "EXPIRADA" : "REVOCADO"} />{i.email_status === "FAILED" ? " · correo falló" : ""}</span>
            {i.state !== "REVOKED" && (
              <span className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => resend.mutate(i.id)}>{i.email_status === "FAILED" ? "Reintentar envío" : "Reenviar invitación"}</Button>
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>Revocar</Button>
              </span>
            )}
          </li>
        ))}
        {(users.data?.members ?? []).map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
            <span><b>{m.full_name}</b> · {m.email || "—"} · {ROLE_LABEL[m.role]}<br /><StatusBadge value={m.status} /></span>
            <span className="flex gap-2">
              <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={m.role} disabled={m.role === "CONDUCTOR" || m.role === "CLIENTE"} onChange={(e) => role.mutate({ user_id: m.user_id, role: e.target.value as Role })}>
                {Object.entries(ROLE_LABEL).filter(([k]) => k !== "CONDUCTOR" && k !== "CLIENTE").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {m.status === "ACTIVE"
                ? <Button size="sm" variant="outline" onClick={() => status.mutate({ user_id: m.user_id, status: "DISABLED" })}>Desactivar</Button>
                : <Button size="sm" variant="outline" onClick={() => status.mutate({ user_id: m.user_id, status: "ACTIVE" })}>Activar</Button>}
            </span>
          </li>
        ))}
      </ul>
      {actionErr && <p className="mt-2 text-sm text-destructive">{actionErr}</p>}
      <h2 className="mt-8 font-display text-xl font-semibold tracking-wide">Auditoría</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {(data.data?.audit ?? []).map((a) => (
          <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-2">
            <span>{a.action} · {a.entity_kind} {a.details}</span>
            <span className="text-muted-foreground">{fmtDate(a.created_at)}</span>
          </li>
        ))}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Personal</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="Nombre"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Correo"><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Puesto"><Input value={form.position ?? ""} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field>
            <Field label="Rol">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo usuario</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="Nombre completo"><Input value={inv.full_name} onChange={(e) => setInv({ ...inv, full_name: e.target.value })} /></Field>
            <Field label="Correo electrónico"><Input type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
            <Field label="Teléfono"><Input value={inv.phone} onChange={(e) => setInv({ ...inv, phone: e.target.value })} /></Field>
            <Field label="Rol">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role, driver_id: undefined, client_id: undefined })}>
                {Object.entries(ROLE_LABEL).filter(([k]) => k !== "ADMIN").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            {inv.role === "CONDUCTOR" && (
              <Field label="Conductor asociado">
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={inv.driver_id ?? ""} onChange={(e) => setInv({ ...inv, driver_id: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {(drivers.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
            )}
            {inv.role === "CLIENTE" && (
              <Field label="Cliente asociado">
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={inv.client_id ?? ""} onChange={(e) => setInv({ ...inv, client_id: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.trade_name}</option>)}
                </select>
              </Field>
            )}
            <p className="text-xs text-muted-foreground">Se enviará una invitación a {inv.email || "—"} como {ROLE_LABEL[inv.role]}. Expira en 72 horas.</p>
            {invErr && <p className="text-sm text-destructive">{invErr}</p>}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInvOpen(false)}>Cancelar</Button>
            <Button disabled={invite.isPending} onClick={() => invite.mutate()}>Crear y enviar invitación</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
