import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/field";
import { createInspection, listCatalog, listInspections } from "@/lib/sotygeo/api";
import { fmtDate } from "@/lib/sotygeo/format";
import { INSPECTION_CATEGORIES, type InspectionStatus } from "@/lib/sotygeo/types";

export const Route = createFileRoute("/inspecciones")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["inspections"], queryFn: () => listInspections() });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => listCatalog() });
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [obs, setObs] = useState("");
  const [items, setItems] = useState(() => INSPECTION_CATEGORIES.map((c) => ({ category: c.id, status: "PASS" as InspectionStatus, notes: "" })));
  const save = useMutation({
    mutationFn: () => createInspection({ data: { vehicle_id: vehicleId, driver_id: driverId || null, observations: obs, items } }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["inspections"] });
    },
  });

  return (
    <div>
      <PageHeader kicker="Operación" title="Inspecciones" description="Ocho categorías. PASS / WARNING / FAIL, con fotografías opcionales." actions={
        <Button onClick={() => setOpen(true)}>Nueva inspección</Button>
      } />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2">Conductor</th>
              <th className="px-3 py-2">Resultado</th>
              <th className="px-3 py-2">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-2">{fmtDate(i.inspected_at)}</td>
                <td className="px-3 py-2">{i.vehicle_number}</td>
                <td className="px-3 py-2">{i.driver_name ?? "—"}</td>
                <td className="px-3 py-2"><StatusBadge value={i.status} /></td>
                <td className="px-3 py-2 text-muted-foreground">{i.observations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Inspección vehicular</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Unidad">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">Selecciona</option>
                {(catalog.data?.vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{v.economic_number}</option>)}
              </select>
            </Field>
            <Field label="Conductor">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">—</option>
                {(catalog.data?.drivers ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          </div>
          <ul className="mt-4 space-y-2">
            {items.map((item, idx) => (
              <li key={item.category} className="flex items-center justify-between gap-2 text-sm">
                <span>{INSPECTION_CATEGORIES[idx]?.label}</span>
                <select
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  value={item.status}
                  onChange={(e) => {
                    const next = items.slice();
                    next[idx] = { ...item, status: e.target.value as InspectionStatus };
                    setItems(next);
                  }}
                >
                  <option value="PASS">PASS</option>
                  <option value="WARNING">WARNING</option>
                  <option value="FAIL">FAIL</option>
                </select>
              </li>
            ))}
          </ul>
          <Field label="Observaciones" className="mt-3">
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={save.isPending || !vehicleId} onClick={() => save.mutate()}>Registrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
