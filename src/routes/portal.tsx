import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, MapPin, PackageCheck, Route as RouteIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getService, listDocuments, listServices } from "@/lib/sotygeo/operations";
import { getBootstrap } from "@/lib/sotygeo/api";
import { fmtDate, fmtKm } from "@/lib/sotygeo/format";
import { profileCan } from "@/lib/sotygeo/security/permissions";

export const Route = createFileRoute("/portal")({ component: Page });

function Page() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const workspace = useQuery({ queryKey: ["portal-workspace"], queryFn: () => getBootstrap() });
  const services = useQuery({ queryKey: ["portal-services"], queryFn: () => listServices({ data: {} }) });
  const documents = useQuery({ queryKey: ["portal-documents"], queryFn: () => listDocuments({ data: {} }) });
  const detail = useQuery({ queryKey: ["portal-service", selectedId], queryFn: () => getService({ data: { id: selectedId! } }), enabled: !!selectedId });
  const isClient = !!workspace.data && profileCan(workspace.data.profile, "portal.read");

  if (!workspace.isPending && !isClient) {
    return <div className="space-y-2"><PageHeader kicker="Portal" title="Portal de cliente" description="Esta vista está reservada para cuentas de cliente." /><p className="text-sm text-muted-foreground">La sesión actual tiene acceso operativo, no acceso de portal.</p></div>;
  }

  const rows = services.data ?? [];
  return (
    <div className="space-y-5">
      <PageHeader kicker="Cliente" title="Portal de servicio" description="Seguimiento de tus servicios, ETA, documentos, paradas y evidencia de entrega." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Servicios</span><RouteIcon className="size-4" /></div><p className="mt-2 font-display text-3xl">{rows.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">En tránsito</span><MapPin className="size-4" /></div><p className="mt-2 font-display text-3xl">{rows.filter((r) => r.status === "IN_TRANSIT").length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Documentos</span><FileText className="size-4" /></div><p className="mt-2 font-display text-3xl">{documents.data?.length ?? 0}</p></CardContent></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>Servicios recientes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {rows.length === 0 ? <p className="text-sm text-muted-foreground">No hay servicios disponibles.</p> : rows.map((r) => (
              <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} className="w-full rounded-xl border border-border p-3 text-left hover:bg-accent/30">
                <div className="flex items-center justify-between gap-3"><span className="font-medium">{r.service_number}</span><StatusBadge value={r.status} /></div>
                <div className="mt-1 text-sm">{r.origin} → {r.destination}</div>
                <div className="mt-1 text-xs text-muted-foreground">ETA {r.eta_at ? fmtDate(r.eta_at) : "sin calcular"} · Unidad {r.vehicle_number ?? "sin asignar"}</div>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>Documentación</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(documents.data ?? []).slice(0, 12).map((d) => <div key={d.id} className="rounded-xl border border-border p-3"><div className="font-medium">{d.title}</div><div className="text-xs text-muted-foreground">{d.document_type} · {d.status} {d.expires_at ? `· vence ${fmtDate(d.expires_at)}` : ""}</div></div>)}
            {documents.data?.length === 0 ? <p className="text-sm text-muted-foreground">Sin documentos asociados.</p> : null}
          </CardContent>
        </Card>
      </div>
      {detail.data ? (
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>Servicio {detail.data.service.service_number}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Ruta planificada</p><p className="mt-1">{fmtKm(detail.data.planned_distance_km)}</p></div>
            <div><p className="text-xs text-muted-foreground">Paradas</p><p className="mt-1">{detail.data.stops.length}</p></div>
            <div><p className="text-xs text-muted-foreground">Entrega</p><p className="mt-1 flex items-center gap-2"><PackageCheck className="size-4" />{detail.data.pod.length ? `Recibido por ${detail.data.pod[0]!.receiver_name}` : "Pendiente"}</p></div>
            <div className="md:col-span-3"><p className="text-xs text-muted-foreground">Estado de paradas</p><div className="mt-2 space-y-2">{detail.data.stops.map((s) => <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm"><span>{s.sequence}. {s.name}</span><StatusBadge value={s.status} /></div>)}</div></div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
