import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";
import { getWorkspace } from "@/lib/sotygeo/workspace";
import { getAccessScope } from "@/lib/sotygeo/security/scope";
import { getResourceScope, hasPermission } from "@/lib/sotygeo/security/permissions";
import { fetchDomainEventsSince, subscribeDomainEvents, type DomainEvent } from "@/lib/sotygeo/events/bus";
import { decideEvent } from "@/lib/sotygeo/events/visibility";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/v1/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getSessionUser();
        if (!user) {
          return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
        }
        const ws = await getWorkspace(user.id);
        const scope = await getAccessScope(ws.profile);
        // Requiere vehicles.read; cada evento se filtra por empresa + scope (events/visibility.ts).
        if (!hasPermission(scope, "vehicles.read")) {
          return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
        }

        const encoder = new TextEncoder();
        let closed = false;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        let revalidate: ReturnType<typeof setInterval> | undefined;
        let poll: ReturnType<typeof setInterval> | undefined;
        let unsubscribe: () => void = () => undefined;
        let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

        const write = (event: string, data: unknown) => {
          if (closed || !streamController) return;
          try {
            streamController.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            close();
          }
        };

        const close = () => {
          if (closed) return;
          closed = true;
          unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
          if (revalidate) clearInterval(revalidate);
          if (poll) clearInterval(poll);
          try {
            streamController?.close();
          } catch {
            // Stream already closed by the runtime.
          }
        };

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            write("ready", { companyId: ws.company.id, at: new Date().toISOString() });
            const viewer = { companyId: ws.company.id, vehiclesScope: getResourceScope(scope, "vehicles"), allowedVehicleIds: scope.allowedVehicleIds };
            // Ids ya entregados (por la vía local o por el polling) para no duplicar.
            const seen = new Set<string>();
            const remember = (id?: string) => {
              if (!id) return true;
              if (seen.has(id)) return false;
              seen.add(id);
              if (seen.size > 1000) seen.delete(seen.values().next().value as string);
              return true;
            };
            const dispatch = (event: DomainEvent) => {
              if (!remember(event.id)) return;
              const d = decideEvent(viewer, event);
              if (d.kind === "allow") return write("message", d.event);
              if (d.kind !== "check-service") return;
              void (async () => {
                try {
                  const sql = await getSql();
                  const r = await sql<{ id: string }>`select id from services where id = ${d.serviceId} and company_id = ${ws.company.id}
                    and ((${scope.forcedClientId}::text is not null and client_id = ${scope.forcedClientId})
                      or (${scope.forcedDriverId}::text is not null and driver_id = ${scope.forcedDriverId}))`;
                  if (r[0]) write("message", d.event);
                } catch { /* sin verificación => no se envía */ }
              })();
            };
            unsubscribe = subscribeDomainEvents(dispatch);
            // Eventos publicados por OTRAS instancias llegan por PostgreSQL (domain_events).
            let since = new Date(Date.now() - 5000).toISOString();
            let polling = false;
            poll = setInterval(() => {
              if (polling || closed) return;
              polling = true;
              void fetchDomainEventsSince(ws.company.id, since)
                .then((rows) => {
                  for (const r of rows) {
                    since = new Date(r.createdAt).toISOString();
                    dispatch(r);
                  }
                })
                .catch(() => undefined)
                .finally(() => { polling = false; });
            }, 2000);
            // Revalida la sesión: rol cambiado, cuenta desactivada o empresa distinta => cierra el stream.
            revalidate = setInterval(() => {
              void getWorkspace(user.id).then((w) => {
                if (w.profile.role !== ws.profile.role || w.profile.status !== "ACTIVE" || w.company.id !== ws.company.id) close();
              }).catch(() => close());
            }, 60_000);
            heartbeat = setInterval(() => write("heartbeat", { at: new Date().toISOString() }), 25000);
            request.signal.addEventListener("abort", close, { once: true });
          },
          cancel() {
            close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
