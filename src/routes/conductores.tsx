import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { listDrivers, upsertDriver } from "@/lib/sotygeo/api";
import { fmtDay } from "@/lib/sotygeo/format";
import type { Driver } from "@/lib/sotygeo/types";

export const Route = createFileRoute("/conductores")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["drivers"], queryFn: () => listDrivers() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Driver> & { name: string }>({ name: "", status: "AVAILABLE" });
  const save = useMutation({
    mutationFn: () => upsertDriver({ data: form }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["drivers"] });
    },
  });

  return (
    <div>
      <PageHeader kicker="Flota" title="Conductores" description="Licencias, asignación y vencimientos." actions={
        <Button onClick={() => { setForm({ name: "", status: "AVAILABLE" }); setOpen(true); }}>Nuevo conductor</Button>
      } />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Licencia</th>
              <th className="px-3 py-2">Vence</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Teléfono</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{d.name}</td>
                <td className="px-3 py-2">{d.license_type} · {d.license_number}</td>
                <td className="px-3 py-2">{fmtDay(d.license_expires_at)}</td>
                <td className="px-3 py-2"><StatusBadge value={d.status} /></td>
                <td className="px-3 py-2">{d.phone}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setForm(d); setOpen(true); }}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conductor</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Teléfono"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Correo"><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Licencia"><Input value={form.license_number ?? ""} onChange={(e) => setForm({ ...form, license_number: e.target.value })} /></Field>
            <Field label="Tipo"><Input value={form.license_type ?? "E"} onChange={(e) => setForm({ ...form, license_type: e.target.value })} /></Field>
            <Field label="Vencimiento"><Input type="date" value={form.license_expires_at ?? ""} onChange={(e) => setForm({ ...form, license_expires_at: e.target.value })} /></Field>
            <Field label="Estado">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Driver["status"] })}>
                <option value="AVAILABLE">Disponible</option>
                <option value="ASSIGNED">Asignado</option>
                <option value="ON_ROUTE">En ruta</option>
                <option value="INACTIVE">Inactivo</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
