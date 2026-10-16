import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { runAllJobs, recordJobRun } from "@/lib/sotygeo/jobs/runner";
import { logJobComplete, logJobFailure, resolveRequestId } from "@/lib/sotygeo/observability";

/** Vercel Cron envía `Authorization: Bearer ${CRON_SECRET}` cuando CRON_SECRET está definido. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/cron/jobs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!process.env.CRON_SECRET?.trim()) {
          return new Response(JSON.stringify({ error: "CRON_SECRET no configurado" }), { status: 503 });
        }
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const requestId = resolveRequestId(request.headers);
        const started = Date.now();
        try {
          await runAllJobs({ force: true });
          const ms = Date.now() - started;
          logJobComplete("cron-jobs", ms, { requestId });
          return Response.json(
            { ok: true, ms, requestId },
            { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "error";
          logJobFailure("cron-jobs", err, { requestId });
          await recordJobRun("cron-jobs", "FAILED", message.slice(0, 300)).catch(() => undefined);
          return new Response(JSON.stringify({ error: "Error interno", requestId }), {
            status: 500,
            headers: { "x-request-id": requestId },
          });
        }
      },
    },
  },
});
