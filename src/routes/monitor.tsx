import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FleetMap } from "@/components/fleet-map";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { getFleetLive, listCatalog } from "@/lib/sotygeo/api";
import { fmtDate } from "@/lib/sotygeo/format";
import { profileCan } from "@/lib/sotygeo/security/permissions";

export const Route = createFileRoute("/monitor")({ component: Monitor });

function Monitor() {
  const [clientId, setClientId] = useState("");
  const [fleetId, setFleetId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [motion, setMotion] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => listCatalog() });
  const live = useQuery({
    queryKey: ["live", clientId, fleetId, vehicleId, motion],
    queryFn: () =>
      getFleetLive({
        data: {
          clientId: clientId || null,
          fleetId: fleetId || null,
          vehicleId: vehicleId || null,
          motion: motion || null,
        },
      }),
    refetchInterval: 15000,
  });
  useEffect(() => {
    const profile = catalog.data?.workspace.profile;
    if (typeof window === "undefined" || typeof window.EventSource === "undefined" || !profile || !profileCan(profile, "vehicles.read")) return;
    const stream = new window.EventSource("/api/v1/events");
    const refresh = () => void live.refetch();
    stream.addEventListener("message", refresh);
    stream.onerror = () => stream.close();
    return () => stream.close();
  }, [catalog.data?.workspace.profile.role, live.refetch]);
  const units = live.data?.units ?? [];
  const selectedUnit = useMemo(() => units.find((u) => u.id === selected), [units, selected]);

  return (
    <div className="flex min-h-0 flex-col">
      <PageHeader
        kicker="Rastreo"
        title="Monitor"
        description="Mapa en vivo con vehículo, estado, velocidad, GPS, conductor, cliente y flotilla."
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Cliente</option>
          {(catalog.data?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.trade_name}</option>)}
        </select>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={fleetId} onChange={(e) => setFleetId(e.target.value)}>
          <option value="">Flotilla</option>
          {(catalog.data?.fleets ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">Vehículo</option>
          {(catalog.data?.vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{v.economic_number}</option>)}
        </select>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={motion} onChange={(e) => setMotion(e.target.value)}>
          <option value="">Estado</option>
          <option value="MOVING">En movimiento</option>
          <option value="STOPPED">Detenido</option>
          <option value="OFFLINE">Sin conexión</option>
        </select>
      </div>
      <Card className="grid overflow-hidden rounded-2xl lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="h-[560px] min-h-[360px]">
          <FleetMap
            units={units}
            geofences={live.data?.geofences}
            selectedId={selected}
            onSelect={setSelected}
            focus={
              selectedUnit?.current_latitude != null
                ? { lat: selectedUnit.current_latitude, lng: selectedUnit.current_longitude!, zoom: 8 }
                : null
            }
          />
        </div>
        <aside className="max-h-[560px] overflow-auto border-t border-border lg:border-t-0 lg:border-l">
          {units.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelected(u.id)}
              className={`block w-full border-b border-border px-4 py-3 text-left text-sm ${selected === u.id ? "bg-accent" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{u.economic_number}</span>
                <StatusBadge value={u.motion_state} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {u.license_plate} · {Math.round(u.last_speed)} km/h
              </p>
              <p className="text-xs text-muted-foreground">
                {u.driver_name ?? "Sin conductor"} · {u.fleet_name ?? "Sin flotilla"}
              </p>
              <p className="text-xs text-muted-foreground">
                {u.client_name ?? "—"} · GPS {u.gps_provider ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">{fmtDate(u.last_gps_at)}</p>
            </button>
          ))}
        </aside>
      </Card>
    </div>
  );
}
