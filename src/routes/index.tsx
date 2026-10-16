import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ClipboardCheck, Gauge, MapPin, Radio, Truck } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { FleetMap } from "@/components/fleet-map";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard } from "@/lib/sotygeo/api";
import { fmtDate, fmtKm, num } from "@/lib/sotygeo/format";
import { cn } from "@/lib/utils";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Centro de control · SOTYGEO" },
      { name: "description", content: "Panel en vivo de tu flota: unidades, servicios, alertas y mapa GPS." },
      { property: "og:title", content: "Centro de control · SOTYGEO" },
      { property: "og:description", content: "Panel en vivo de tu flota: unidades, servicios, alertas y mapa GPS." },
    ],
  }),
  component: Dashboard,
});

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Gauge;
}) {
  return (
    <Card className="rounded-xl">
      <CardContent className="flex items-start justify-between pt-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular tracking-wide">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <Icon className="size-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const [clientId, setClientId] = useState("");
  const [fleetId, setFleetId] = useState("");
  const [from, setFrom] = useState("");
  const queryClient = useQueryClient();
  const { user, isPending: userPending } = useCurrentUserState();
  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined" || typeof window.EventSource === "undefined") return;
    const stream = new window.EventSource("/api/v1/events");
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["services"] });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    stream.addEventListener("message", refresh);
    stream.onerror = () => stream.close();
    return () => { stream.removeEventListener("message", refresh); stream.close(); };
  }, [queryClient, user]);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["dashboard", clientId, fleetId, from, user?.id],
    queryFn: () =>
      getDashboard({
        data: {
          clientId: clientId || null,
          fleetId: fleetId || null,
          from: from || undefined,
        },
      }),
    enabled: Boolean(user) && !userPending,
    retry: 2,
    refetchInterval: 15000,
  });

  const selectedUnit = useMemo(() => data?.fleet.find((u) => u.id === selected), [data, selected]);

  if (userPending || isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[420px]" />
      </div>
    );
  }
  if (error || !data) {
    const isUnauthorized =
      error instanceof Error &&
      (error.message === "Unauthorized" || error.name === "UnauthorizedError");
    return (
      <div className="grid max-w-md gap-3">
        <p className="text-sm text-destructive">No se pudo cargar el tablero.</p>
        <p className="text-xs text-muted-foreground">
          {isUnauthorized
            ? "La sesión no se pudo verificar. Prueba reintentar o cierra sesión y vuelve a entrar."
            : error instanceof Error
              ? error.message
              : "Intenta de nuevo en unos segundos."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
              void refetch();
            }}
          >
            Reintentar
          </Button>
          {isUnauthorized ? (
            <Button
              type="button"
              variant="ghost"
              className="w-fit text-destructive"
              onClick={() => {
                void import("@/lib/auth/client").then(({ signOut }) => signOut()).catch(() => undefined);
              }}
            >
              Cerrar sesión
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const k = data.kpis;

  return (
    <div>
      <PageHeader
        kicker="Operación"
        title="Tablero"
        description="Movimiento de la flota, kilometraje del día, alertas y geocercas."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Todos los clientes</option>
          {data.clients.map((c) => (
            <option key={c.id} value={c.id}>{c.trade_name}</option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={fleetId} onChange={(e) => setFleetId(e.target.value)}>
          <option value="">Todas las flotillas</option>
          {data.fleets.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <input
          type="date"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="En movimiento" value={String(k.moving)} icon={Truck} />
        <Kpi label="Detenidos" value={String(k.stopped)} icon={Gauge} />
        <Kpi label="Sin conexión" value={String(k.offline)} icon={Radio} />
        <Kpi label="Kilometraje" value={fmtKm(k.km)} hint="periodo seleccionado" icon={MapPin} />
        <Kpi label="Alertas de velocidad" value={String(k.alerts)} icon={AlertTriangle} />
        <Kpi label="Eventos geocerca" value={String(k.geo_events)} icon={MapPin} />
        <Kpi label="Inspecciones" value={String(k.inspections)} hint={`${k.fail_insp} con falla`} icon={ClipboardCheck} />
        <Kpi label="Utilización" value={`${num.format(k.utilization)}%`} hint="unidades en movimiento" icon={Gauge} />
      </div>

      {data.fleet.length === 0 ? (
        <Card className="mt-5 rounded-2xl">
          <CardContent className="flex flex-col items-start gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-lg font-semibold tracking-wide">Tu centro de control está listo</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Aún no hay unidades. Agrega el primer vehículo para verlo en el mapa, el historial y las alertas.
              </p>
            </div>
            <Button asChild>
              <Link to="/vehiculos">Agregar vehículo</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
        <Card className="overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div>
              <p className="font-display text-sm tracking-[0.18em] text-muted-foreground uppercase">Mapa de flota</p>
              <p className="text-sm text-muted-foreground">Posición viva · canal de simulación de desarrollo</p>
            </div>
          </div>
          <div className="h-[420px]">
            <FleetMap
              units={data.fleet}
              geofences={data.geofences}
              selectedId={selected}
              onSelect={setSelected}
              focus={
                selectedUnit?.current_latitude != null && selectedUnit.current_longitude != null
                  ? { lat: selectedUnit.current_latitude, lng: selectedUnit.current_longitude, zoom: 7 }
                  : null
              }
            />
          </div>
          {selectedUnit ? (
            <div className="grid gap-2 border-t border-border px-5 py-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Unidad</p>
                {selectedUnit.economic_number} · {selectedUnit.license_plate}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estado</p>
                <StatusBadge value={selectedUnit.motion_state} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Conductor</p>
                {selectedUnit.driver_name ?? "—"}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Último GPS</p>
                {fmtDate(selectedUnit.last_gps_at)}
              </div>
            </div>
          ) : null}
        </Card>
        <div className="grid gap-4">
          <Card className="rounded-2xl">
            <CardContent className="pt-5">
              <p className="font-display text-sm tracking-[0.18em] text-muted-foreground uppercase">Alertas</p>
              <ul className="mt-3 space-y-3">
                {data.notifications.length === 0 ? (
                  <li className="text-sm text-muted-foreground">Sin avisos</li>
                ) : (
                  data.notifications.slice(0, 6).map((n) => (
                    <li key={n.id} className={cn("border-b border-border pb-2 last:border-0")}>
                      <p className="text-sm">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.body}</p>
                    </li>
                  ))
                )}
              </ul>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="pt-5">
              <p className="font-display text-sm tracking-[0.18em] text-muted-foreground uppercase">Unidades</p>
              <ul className="mt-3 max-h-56 space-y-2 overflow-auto">
                {data.fleet.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                    <button type="button" className="text-left" onClick={() => setSelected(u.id)}>
                      {u.economic_number}
                      <span className="ml-2 text-xs text-muted-foreground">{Math.round(u.last_speed)} km/h</span>
                    </button>
                    <StatusBadge value={u.motion_state} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}


