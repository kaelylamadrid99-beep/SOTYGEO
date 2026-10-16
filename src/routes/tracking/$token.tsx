import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FleetMap } from "@/components/fleet-map";
import { StatusBadge } from "@/components/status-badge";
import { getPublicTrack } from "@/lib/sotygeo/api";
import { fmtDate } from "@/lib/sotygeo/format";

export const Route = createFileRoute("/tracking/$token")({ component: Page });

function Page() {
  const { token } = Route.useParams();
  const q = useQuery({
    queryKey: ["public-track", token],
    queryFn: () => getPublicTrack({ data: { token } }),
    refetchInterval: 5000,
    retry: false,
  });

  if (q.isPending) return <main className="grid min-h-screen place-items-center">Cargando seguimiento…</main>;
  if (q.error || !q.data) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="max-w-sm text-center">
          <p className="font-display text-sm tracking-[0.28em] text-muted-foreground">SOTYGEO</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Enlace no disponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">El seguimiento expiró, fue revocado o el token no es válido.</p>
        </div>
      </main>
    );
  }
  const d = q.data;
  const trail = d.trail.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) }));

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="font-display text-xs tracking-[0.24em] text-muted-foreground">SEGUIMIENTO</p>
          <h1 className="font-display text-2xl font-semibold tracking-wide">{d.economic_number}</h1>
        </div>
        <StatusBadge value={d.motion_state} />
      </header>
      <div className="h-[60vh] min-h-[280px]">
        <FleetMap
          units={[{
            id: "u",
            economic_number: d.economic_number,
            license_plate: d.license_plate,
            current_latitude: d.current_latitude,
            current_longitude: d.current_longitude,
            last_speed: d.last_speed,
            last_heading: 0,
            motion_state: d.motion_state,
            driver_name: d.driver_name,
          }]}
          route={trail}
          focus={
            d.current_latitude != null
              ? { lat: d.current_latitude, lng: d.current_longitude!, zoom: 8 }
              : null
          }
        />
      </div>
      <section className="grid gap-3 p-5 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Placas</p>
          {d.license_plate}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Velocidad</p>
          {Math.round(d.last_speed)} km/h
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Último reporte</p>
          {fmtDate(d.last_gps_at)}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Conductor</p>
          {d.driver_name ?? "—"}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Vigencia del enlace</p>
          {fmtDate(d.expires_at)}
        </div>
      </section>
    </main>
  );
}
