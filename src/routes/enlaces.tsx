import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { createTrackingLink, listTrackingLinks, listVehicles, revokeTrackingLink } from "@/lib/sotygeo/api";
import { fmtDate } from "@/lib/sotygeo/format";

export const Route = createFileRoute("/enlaces")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["links"], queryFn: () => listTrackingLinks() });
  const vehicles = useQuery({ queryKey: ["vehicles"], queryFn: () => listVehicles() });
  const [vehicleId, setVehicleId] = useState("");
  const [hours, setHours] = useState(24);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => createTrackingLink({ data: { vehicleId, hours } }),
    onSuccess: (r) => {
      setLastToken(r.token);
      void qc.invalidateQueries({ queryKey: ["links"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeTrackingLink({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["links"] }),
  });

  return (
    <div>
      <PageHeader kicker="Administración" title="Enlaces temporales" description="El enlace público caduca solo y solo muestra la unidad autorizada." />
      <div className="mb-5 flex flex-wrap items-end gap-2">
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">Vehículo</option>
          {(vehicles.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.economic_number}</option>)}
        </select>
        <input type="number" className="h-10 w-24 rounded-md border border-input bg-background px-3 text-sm" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        <Button disabled={!vehicleId || create.isPending} onClick={() => create.mutate()}>Crear enlace</Button>
      </div>
      {lastToken ? (
        <div className="mb-4 rounded-xl border border-border bg-secondary/40 p-3 text-sm">
          <p className="font-medium">Enlace creado</p>
          <p className="mt-1 break-all text-muted-foreground">Se muestra una sola vez porque la credencial se almacena únicamente como hash.</p>
          <a className="mt-2 inline-block break-all underline" href={`/tracking/${lastToken}`}>{typeof window !== "undefined" ? `${window.location.origin}/tracking/${lastToken}` : lastToken}</a>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2">Expira</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-3 py-2">{l.vehicle_number}</td>
                <td className="px-3 py-2">{fmtDate(l.expires_at)}</td>
                <td className="px-3 py-2"><StatusBadge value={l.status} /></td>
                <td className="px-3 py-2 text-right">
                  {l.status === "ACTIVE" ? (
                    <Button size="sm" variant="outline" onClick={() => revoke.mutate(l.id)}>Revocar</Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
