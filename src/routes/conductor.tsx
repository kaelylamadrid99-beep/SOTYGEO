import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listVehicles, postSmartphoneFix } from "@/lib/sotygeo/api";

export const Route = createFileRoute("/conductor")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const vehicles = useQuery({ queryKey: ["vehicles"], queryFn: () => listVehicles() });
  const [vehicleId, setVehicleId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: async () => {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) reject(new Error("Sin geolocalización"));
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 });
      });
      await postSmartphoneFix({
        data: {
          vehicleId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          speed: (pos.coords.speed ?? 0) * 3.6,
          heading: pos.coords.heading ?? 0,
        },
      });
    },
    onSuccess: () => {
      setMsg("Posición enviada por proveedor smartphone.");
      void qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "No se pudo enviar"),
  });

  const v = (vehicles.data ?? []).find((x) => x.id === vehicleId) ?? vehicles.data?.[0];

  return (
    <div className="mx-auto max-w-lg p-4">
      <PageHeader kicker="Conductor" title="App de campo" description="Reporta posición por smartphone e inicia una inspección desde el centro de control." />
      <Card className="rounded-2xl">
        <CardContent className="grid gap-3 pt-5">
          <select className="h-11 rounded-md border border-input bg-background px-3" value={vehicleId || v?.id || ""} onChange={(e) => setVehicleId(e.target.value)}>
            {(vehicles.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.economic_number} · {u.license_plate}</option>
            ))}
          </select>
          {v ? (
            <div className="text-sm">
              <StatusBadge value={v.motion_state} />
              <p className="mt-2 text-muted-foreground">{Math.round(v.last_speed)} km/h · {v.driver_name ?? "sin conductor"}</p>
            </div>
          ) : null}
          <Button
            className="h-12"
            disabled={send.isPending || !(vehicleId || v?.id)}
            onClick={() => {
              if (!vehicleId && v) setVehicleId(v.id);
              send.mutate();
            }}
          >
            Enviar mi posición
          </Button>
          {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
          <a href="/inspecciones" className="text-sm underline underline-offset-4">Registrar inspección</a>
        </CardContent>
      </Card>
    </div>
  );
}
