import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { assignVehicleFleet, listCatalog, listFleets, listVehicles, upsertFleet } from "@/lib/sotygeo/api";
import type { Fleet } from "@/lib/sotygeo/types";

export const Route = createFileRoute("/flotillas")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["fleets"], queryFn: () => listFleets() });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => listCatalog() });
  const vehicles = useQuery({ queryKey: ["vehicles"], queryFn: () => listVehicles() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Fleet> & { name: string }>({ name: "", status: "ACTIVE" });
  const save = useMutation({
    mutationFn: () => upsertFleet({ data: form }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["fleets"] });
    },
  });
  const assign = useMutation({
    mutationFn: (d: { vehicleId: string; fleetId: string | null }) => assignVehicleFleet({ data: d }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vehicles"] });
      void qc.invalidateQueries({ queryKey: ["fleets"] });
    },
  });

  return (
    <div>
      <PageHeader kicker="Flota" title="Flotillas" description="Una flotilla pertenece a un cliente y agrupa vehículos." actions={
        <Button onClick={() => { setForm({ name: "", status: "ACTIVE" }); setOpen(true); }}>Nueva flotilla</Button>
      } />
      <div className="grid gap-4 lg:grid-cols-2">
        {(rows.data ?? []).map((f) => (
          <div key={f.id} className="panel rounded-2xl p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-semibold tracking-wide">{f.name}</h2>
                <p className="text-sm text-muted-foreground">{f.client_name ?? "Sin cliente"} · {f.vehicle_count ?? 0} unidades</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge value={f.status} />
                <Button size="sm" variant="ghost" onClick={() => { setForm(f); setOpen(true); }}>Editar</Button>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {(vehicles.data ?? []).filter((v) => v.fleet_id === f.id).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2">
                  <span>{v.economic_number} · {v.license_plate}</span>
                  <Button size="sm" variant="outline" onClick={() => assign.mutate({ vehicleId: v.id, fleetId: null })}>Retirar</Button>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) assign.mutate({ vehicleId: e.target.value, fleetId: f.id });
                  e.target.value = "";
                }}
              >
                <option value="">Asignar vehículo…</option>
                {(vehicles.data ?? []).filter((v) => v.fleet_id !== f.id && v.status !== "INACTIVE").map((v) => (
                  <option key={v.id} value={v.id}>{v.economic_number}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Flotilla</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Descripción"><Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Cliente">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.client_id ?? ""} onChange={(e) => setForm({ ...form, client_id: e.target.value || null })}>
                <option value="">—</option>
                {(catalog.data?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.trade_name}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ACTIVE">Activa</option>
                <option value="INACTIVE">Inactiva</option>
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
