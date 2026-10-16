import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { listCatalog, listVehicles, upsertVehicle } from "@/lib/sotygeo/api";
import { VEHICLE_TYPES, FUEL_TYPES, VEHICLE_LABEL } from "@/lib/sotygeo/format";
import type { Vehicle } from "@/lib/sotygeo/types";

export const Route = createFileRoute("/vehiculos")({ component: Page });

function empty(): Partial<Vehicle> & { economic_number: string; license_plate: string } {
  return { economic_number: "", license_plate: "", brand: "", model: "", vehicle_type: "TRACTO", status: "ACTIVE", speed_limit_kmh: 90, fuel_type: "DIESEL", capacity: 0, vin: "" };
}

function Page() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["vehicles"], queryFn: () => listVehicles() });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => listCatalog() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const save = useMutation({
    mutationFn: () => upsertVehicle({ data: form }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  return (
    <div>
      <PageHeader kicker="Flota" title="Vehículos" description="Activos, GPS, conductor, flotilla y cliente." actions={
        <Button onClick={() => { setForm(empty()); setOpen(true); }}>Nueva unidad</Button>
      } />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Económico</th>
              <th className="px-3 py-2">Placas</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Movimiento</th>
              <th className="px-3 py-2">Conductor</th>
              <th className="px-3 py-2">Flotilla</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((v) => (
              <tr key={v.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{v.economic_number}</td>
                <td className="px-3 py-2">{v.license_plate}</td>
                <td className="px-3 py-2">{v.vehicle_type}</td>
                <td className="px-3 py-2"><StatusBadge value={v.status} /></td>
                <td className="px-3 py-2"><StatusBadge value={v.motion_state} /></td>
                <td className="px-3 py-2">{v.driver_name ?? "—"}</td>
                <td className="px-3 py-2">{v.fleet_name ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setForm(v); setOpen(true); }}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Editar unidad" : "Nueva unidad"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Económico"><Input value={form.economic_number} onChange={(e) => setForm({ ...form, economic_number: e.target.value })} /></Field>
            <Field label="Placas"><Input value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} /></Field>
            <Field label="Marca"><Input value={form.brand ?? ""} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
            <Field label="Modelo"><Input value={form.model ?? ""} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label="Año"><Input type="number" value={form.year ?? ""} onChange={(e) => setForm({ ...form, year: Number(e.target.value) || null })} /></Field>
            <Field label="Tipo">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
                {VEHICLE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Vehicle["status"] })}>
                {(["ACTIVE", "AVAILABLE", "ASSIGNED", "IN_SERVICE", "MAINTENANCE", "OUT_OF_SERVICE", "INACTIVE"] as const).map((s) => (
                  <option key={s} value={s}>{VEHICLE_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field label="VIN"><Input value={form.vin ?? ""} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></Field>
            <Field label="Combustible">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.fuel_type ?? "DIESEL"} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}>
                {FUEL_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Capacidad"><Input type="number" value={form.capacity ?? 0} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) || 0 })} /></Field>
            <Field label="Límite km/h"><Input type="number" value={form.speed_limit_kmh ?? 90} onChange={(e) => setForm({ ...form, speed_limit_kmh: Number(e.target.value) })} /></Field>
            <Field label="Cliente">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.client_id ?? ""} onChange={(e) => setForm({ ...form, client_id: e.target.value || null })}>
                <option value="">—</option>
                {(catalog.data?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.trade_name}</option>)}
              </select>
            </Field>
            <Field label="Flotilla">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.fleet_id ?? ""} onChange={(e) => setForm({ ...form, fleet_id: e.target.value || null })}>
                <option value="">—</option>
                {(catalog.data?.fleets ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Conductor">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.current_driver_id ?? ""} onChange={(e) => setForm({ ...form, current_driver_id: e.target.value || null })}>
                <option value="">—</option>
                {(catalog.data?.drivers ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
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
