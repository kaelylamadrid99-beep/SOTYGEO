import { createFileRoute } from "@tanstack/react-router";
import { IngestError, ingestExternal } from "@/lib/sotygeo/api";
import { clientIpFromHeaders } from "@/lib/sotygeo/security/client-ip";
import { dbRateLimit } from "@/lib/sotygeo/security/rate-limit";

const MAX_BODY_BYTES = 4096;
/** Tope por IP y minuto, ANTES de tocar la BD de dispositivos. Ajustable para gateways con muchos equipos tras una IP. */
const IP_LIMIT = Number(process.env.GPS_INGEST_IP_LIMIT) > 0 ? Number(process.env.GPS_INGEST_IP_LIMIT) : 600;

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

export const Route = createFileRoute("/api/v1/gps/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!(await dbRateLimit(`gps-ip:${clientIpFromHeaders(request.headers)}`, IP_LIMIT))) {
            return json({ error: "Demasiadas solicitudes" }, 429, { "Retry-After": "60" });
          }
          const declared = Number(request.headers.get("content-length") ?? 0);
          if (declared > MAX_BODY_BYTES) return json({ error: "Cuerpo demasiado grande" }, 413);
          const raw = await request.text();
          if (raw.length > MAX_BODY_BYTES) return json({ error: "Cuerpo demasiado grande" }, 413);
          let body: { imei?: unknown; token?: unknown };
          try {
            body = JSON.parse(raw);
          } catch {
            return json({ error: "JSON inválido" }, 400);
          }
          if (!body?.imei || !body?.token) return json({ error: "imei y token requeridos" }, 400);
          const result = await ingestExternal(body);
          return Response.json(result, { headers: { "Cache-Control": "no-store" } });
        } catch (err) {
          if (err instanceof IngestError) {
            return json({ error: err.message }, err.status, err.status === 429 ? { "Retry-After": "60" } : {});
          }
          // Errores internos (BD, bugs): detalle solo en el log del servidor.
          console.error("[gps-ingest] error interno", err instanceof Error ? err.message : err);
          return json({ error: "Error interno" }, 500);
        }
      },
    },
  },
});
