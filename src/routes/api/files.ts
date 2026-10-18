import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";
import { getSql } from "@/lib/db";
import { keyBelongsTo } from "@/lib/sotygeo/security/storage-paths";
import { getWorkspace } from "@/lib/sotygeo/workspace";

const NOT_FOUND = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export const Route = createFileRoute("/api/files")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const uid = params.get("u") ?? "";
        const user = (await getSessionUser(request)) ?? (uid ? { id: uid, email: null } : null);
        if (!user) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
        const key = params.get("key") ?? "";
        const token = params.get("t") ?? "";
        if (!key || !token) return NOT_FOUND();
        // Firma emitida por getEvidenceUrl (que sí aplica permisos y scope): ligada a
        // clave + usuario, con expiración. Sin ella la clave por sí sola no da acceso.
        const { verifyFileToken } = await import("@/lib/sotygeo/security/signing.server");
        if (!verifyFileToken(token, { key, userId: user.id })) return NOT_FOUND();
        const ws = await getWorkspace(user.id).catch(() => null);
        if (!ws || !keyBelongsTo(key, ws.company.id)) return NOT_FOUND();
        const sql = await getSql();
        const row = (
          await sql<{ content_type: string; bytes: Uint8Array }>`
            select content_type, bytes from evidence_blobs where key = ${key} and company_id = ${ws.company.id}
          `
        )[0];
        if (!row) return NOT_FOUND();
        const raw = row.bytes as unknown;
        const body =
          raw instanceof Uint8Array
            ? raw
            : typeof raw === "string" && raw.startsWith("\\x")
              ? new Uint8Array((raw.slice(2).match(/../g) ?? []).map((h) => parseInt(h, 16)))
              : new Uint8Array();
        return new Response(Buffer.from(body), {
          headers: {
            "Content-Type": row.content_type,
            "Cache-Control": "private, no-store",
            // El contenido lo sube un usuario: nunca debe ejecutarse ni interpretarse como otro tipo.
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        });
      },
    },
  },
});
