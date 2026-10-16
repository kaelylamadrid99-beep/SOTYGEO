import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FleetMap } from "@/components/fleet-map";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getRouteHistory, listVehicles } from "@/lib/sotygeo/api";
import { fmtDate, fmtKm } from "@/lib/sotygeo/format";
import { haversineKm } from "@/lib/geo";

export const Route = createFileRoute("/historial")({ component: HistoryPage });

function HistoryPage() {
  const vehicles = useQuery({ queryKey: ["vehicles"], queryFn: () => listVehicles() });
  const [vehicleId, setVehicleId] = useState("");
  const [from, setFrom] = useState(() => new Date(Date.now() - 12 * 3600_000).toISOString().slice(0, 16));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [idx, setIdx] = useState(0);

  const hist = useQuery({
    queryKey: ["history", vehicleId, from, to],
    queryFn: () =>
      getRouteHistory({
        data: {
          vehicleId,
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
        },
      }),
    enabled: Boolean(vehicleId),
  });

  const points = hist.data?.points ?? [];
  useEffect(() => {
    setIdx(0);
    setPlaying(false);
  }, [hist.data]);

  useEffect(() => {
    if (!playing || points.length < 2) return;
    const t = window.setInterval(() => {
      setIdx((i) => {
        if (i >= points.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, Math.max(80, 420 / speed));
    return () => window.clearInterval(t);
  }, [playing, points.length, speed]);

  const route = useMemo(
    () => points.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })),
    [points],
  );
  const current = points[idx];
  let dist = 0;
  for (let i = 1; i <= idx && i < points.length; i++) {
    dist += haversineKm(
      { lat: Number(points[i - 1]!.latitude), lng: Number(points[i - 1]!.longitude) },
      { lat: Number(points[i]!.latitude), lng: Number(points[i]!.longitude) },
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Rutas"
        title="Historial"
        description="Reproduce el recorrido GPS. El historial no se borra automáticamente."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">Vehículo</option>
          {(vehicles.data ?? []).map((v) => (
            <option key={v.id} value={v.id}>{v.economic_number} · {v.license_plate}</option>
          ))}
        </select>
        <input type="datetime-local" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="datetime-local" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Card className="overflow-hidden rounded-2xl">
        <div className="h-[480px]">
          <FleetMap
            units={
              current
                ? [{
                    id: vehicleId,
                    economic_number: hist.data?.vehicle.economic_number ?? "",
                    license_plate: hist.data?.vehicle.license_plate ?? "",
                    current_latitude: Number(current.latitude),
                    current_longitude: Number(current.longitude),
                    last_speed: Number(current.speed),
                    last_heading: Number(current.heading),
                    motion_state: Number(current.speed) >= 5 ? "MOVING" : "STOPPED",
                  }]
                : []
            }
            route={route}
            playhead={current ? { lat: Number(current.latitude), lng: Number(current.longitude) } : null}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <Button size="sm" variant="outline" onClick={() => setIdx((i) => Math.max(0, i - 1))} aria-label="Retroceder">
            <SkipBack className="size-4" />
          </Button>
          <Button size="sm" onClick={() => setPlaying((p) => !p)} disabled={points.length < 2} aria-label={playing ? "Pausar" : "Reproducir"}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIdx((i) => Math.min(points.length - 1, i + 1))} aria-label="Avanzar">
            <SkipForward className="size-4" />
          </Button>
          {[1, 2, 4, 8].map((s) => (
            <Button key={s} size="sm" variant={speed === s ? "default" : "outline"} onClick={() => setSpeed(s)}>
              {s}x
            </Button>
          ))}
          <p className="ml-auto text-sm text-muted-foreground">
            {current ? fmtDate(current.recorded_at) : "—"} · {current ? `${Math.round(Number(current.speed))} km/h` : "—"} · {fmtKm(dist)} / {fmtKm(hist.data?.km ?? 0)} · {points.length} puntos{hist.data?.truncated ? " · límite 10,000 puntos" : ""}
          </p>
        </div>
      </Card>
    </div>
  );
}
