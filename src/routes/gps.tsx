import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { listCatalog, listDevices, upsertDevice } from "@/lib/sotygeo/api";
import type { GpsDevice } from "@/lib/sotygeo/types";
import { PROVIDER_LABEL } from "@/lib/sotygeo/format";

export const Route = createFileRoute("/gps")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["devices"], queryFn: () => listDevices() });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => listCatalog() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<GpsDevice> & { provider: GpsDevice["provider"]; device_imei: string }>({
    provider: "EXTERNAL",
    device_imei: "",
    sim_route: "[]",
    sim_progress: 0,
    sim_mode: "MOVING",
  });
  const save = useMutation({
    mutationFn: () => upsertDevice({ data: form }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  return (
    <div>
      <PageHeader
        kicker="Flota"
        title="Equipos GPS"
        description="Proveedores externo, smartphone y simulador. El simulador es solo para desarrollo."
        actions={<Button onClick={() => { setForm({ provider: "EXTERNAL", device_imei: "" }); setOpen(true); }}>Registrar equipo</Button>}
      />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">IMEI</th>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Token ingest</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{d.device_imei}</td>
                <td className="px-3 py-2"><StatusBadge value={d.provider} /></td>
                <td className="px-3 py-2">{d.vehicle_number ?? "—"}</td>
                <td className="px-3 py-2"><StatusBadge value={d.status} /></td>
                <td className="px-3 py-2 font-mono text-xs">{d.ingest_token ? `${d.ingest_token.slice(0, 8)}…` : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setForm(d); setOpen(true); }}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Ingestión real: POST /api/v1/gps/ingest con IMEI y token. App conductor usa el proveedor smartphone.
        {` `}Etiqueta de proveedores: {Object.values(PROVIDER_LABEL).join(", ")}.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Equipo GPS</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="IMEI"><Input value={form.device_imei} onChange={(e) => setForm({ ...form, device_imei: e.target.value })} /></Field>
            <Field label="Proveedor">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as GpsDevice["provider"] })}>
                <option value="EXTERNAL">GPS externo</option>
                <option value="SMARTPHONE">Smartphone</option>
                <option value="SIMULATOR">Simulador (dev)</option>
              </select>
            </Field>
            <Field label="Unidad">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.vehicle_id ?? ""} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value || null })}>
                <option value="">Sin asignar</option>
                {(catalog.data?.vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{v.economic_number}</option>)}
              </select>
            </Field>
            {form.provider === "SIMULATOR" ? (
              <>
                <Field label="Modo simulador">
                  <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.sim_mode ?? "MOVING"} onChange={(e) => setForm({ ...form, sim_mode: e.target.value as GpsDevice["sim_mode"] })}>
                    <option value="MOVING">En movimiento</option>
                    <option value="STOPPED">Detenido</option>
                    <option value="OFFLINE">Offline</option>
                  </select>
                </Field>
                <Field label="Progreso (0 a 1)"><Input type="number" min="0" max="1" step="0.01" value={form.sim_progress ?? 0} onChange={(e) => setForm({ ...form, sim_progress: Math.min(1, Math.max(0, Number(e.target.value))) })} /></Field>
                <Field label="Ruta JSON del simulador" className="sm:col-span-2"><textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" value={form.sim_route ?? "[]"} onChange={(e) => setForm({ ...form, sim_route: e.target.value })} placeholder='[{"lat":20.6,"lng":-100.4},{"lat":20.55,"lng":-100.35}]' /></Field>
                <p className="text-xs text-muted-foreground sm:col-span-2">Solo desarrollo. La telemetría simulada vive en <code>vehicle_simulations</code>, separada de la posición real del vehículo.</p>
              </>
            ) : null}
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
