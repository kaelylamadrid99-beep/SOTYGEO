import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { listGeofenceEvents, listGeofences, upsertGeofence } from "@/lib/sotygeo/api";
import { GEOFENCE_LABEL, fmtDate } from "@/lib/sotygeo/format";
import type { Geofence, GeofenceType } from "@/lib/sotygeo/types";

export const Route = createFileRoute("/geocercas")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["geofences"], queryFn: () => listGeofences() });
  const events = useQuery({ queryKey: ["geofence-events"], queryFn: () => listGeofenceEvents() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Geofence> & { name: string; type: GeofenceType; lat: number; lng: number }>({
    name: "", type: "BASE", lat: 25.6866, lng: -100.3161, radius_m: 600, status: "ACTIVE",
  });
  const save = useMutation({
    mutationFn: () => upsertGeofence({ data: form }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["geofences"] });
    },
  });

  return (
    <div>
      <PageHeader kicker="Flota" title="Geocercas" description="Tipos BASE, CLIENTE, OPERACION, RESTRINGIDA y OTRA. Eventos ENTER / EXIT." actions={
        <Button onClick={() => { setForm({ name: "", type: "BASE", lat: 25.6866, lng: -100.3161, radius_m: 600, status: "ACTIVE" }); setOpen(true); }}>Nueva geocerca</Button>
      } />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Radio</th>
              <th className="px-3 py-2">Geometría</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((g) => (
              <tr key={g.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{g.name}</td>
                <td className="px-3 py-2"><StatusBadge value={g.type} /></td>
                <td className="px-3 py-2">{g.radius_m} m</td>
                <td className="px-3 py-2">{g.polygon ? "Polígono" : "Círculo"}</td>
                <td className="px-3 py-2"><StatusBadge value={g.status} /></td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setForm(g); setOpen(true); }}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-8 font-display text-xl font-semibold tracking-wide">Eventos recientes</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {(events.data ?? []).slice(0, 12).map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
            <span>{e.vehicle_number} · {e.geofence_name}</span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <StatusBadge value={e.kind} />
              {fmtDate(e.recorded_at)}
              {e.dwell_seconds != null ? ` · ${Math.round(e.dwell_seconds / 60)} min` : ""}
            </span>
          </li>
        ))}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Geocerca</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Tipo">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as GeofenceType })}>
                {Object.entries(GEOFENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Radio m"><Input type="number" value={form.radius_m ?? 600} onChange={(e) => setForm({ ...form, radius_m: Number(e.target.value) })} /></Field>
            <Field label="Latitud"><Input type="number" value={form.lat} onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })} /></Field>
            <Field label="Longitud"><Input type="number" value={form.lng} onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })} /></Field>
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
