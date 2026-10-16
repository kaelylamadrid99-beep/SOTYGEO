import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { listClients, upsertClient } from "@/lib/sotygeo/api";
import type { Client } from "@/lib/sotygeo/types";

export const Route = createFileRoute("/clientes")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["clients"], queryFn: () => listClients() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Client> & { legal_name: string; trade_name: string }>({ legal_name: "", trade_name: "", status: "ACTIVE" });
  const save = useMutation({
    mutationFn: () => upsertClient({ data: form }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  return (
    <div>
      <PageHeader kicker="Administración" title="Clientes" description="Corporativos con vehículos, GPS, conductores, flotillas y geocercas." actions={
        <Button onClick={() => { setForm({ legal_name: "", trade_name: "", status: "ACTIVE" }); setOpen(true); }}>Nuevo cliente</Button>
      } />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Nombre comercial</th>
              <th className="px-3 py-2">Razón social</th>
              <th className="px-3 py-2">RFC</th>
              <th className="px-3 py-2">Contacto</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{c.trade_name}</td>
                <td className="px-3 py-2">{c.legal_name}</td>
                <td className="px-3 py-2">{c.rfc}</td>
                <td className="px-3 py-2">{c.contact_name}</td>
                <td className="px-3 py-2"><StatusBadge value={c.status} /></td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setForm(c); setOpen(true); }}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cliente</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre comercial"><Input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} /></Field>
            <Field label="Razón social"><Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} /></Field>
            <Field label="RFC"><Input value={form.rfc ?? ""} onChange={(e) => setForm({ ...form, rfc: e.target.value })} /></Field>
            <Field label="Contacto"><Input value={form.contact_name ?? ""} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
            <Field label="Teléfono"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Correo"><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Dirección" className="sm:col-span-2"><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
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
