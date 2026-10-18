import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { writeAudit } from "../db";
import { dbRateLimit } from "../security/rate-limit";
import { authorize, auditDenied } from "../security/authorize";
import { scopeOf } from "../security/permissions";
import { serviceVisible } from "../security/scope";
import {
  ALLOWED_MIME, EVIDENCE_KINDS, MAX_EVIDENCE_BYTES, SIGNED_URL_TTL_SECONDS, buildEvidenceKey, keyBelongsTo, matchesMagic,
} from "../security/storage-paths";
import { getAccessScope } from "../security/scope";
import { getWorkspace } from "../workspace";

const NOT_FOUND = "No encontrado"; // ausencia segura: igual para "no existe" y "no autorizado"

type Svc = { id: string; client_id: string | null; vehicle_id: string | null; driver_id: string | null };

/** ¿El servicio es visible para este perfil? (empresa + scope CLIENT/ASSIGNED/COMPANY) */
async function loadVisibleService(ws: Awaited<ReturnType<typeof getWorkspace>>, serviceId: string): Promise<Svc | null> {
  const sql = await getSql();
  const scope = await getAccessScope(ws.profile);
  const svc = (await sql<Svc>`select id, client_id, vehicle_id, driver_id from services where id = ${serviceId} and company_id = ${ws.company.id}`)[0];
  return svc && serviceVisible(scope, svc) ? svc : null;
}

/** Destino de subida firmado. La ruta la decide el SERVIDOR; el cliente solo elige tipo/entidad. */
export const createEvidenceUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    kind: z.enum(EVIDENCE_KINDS),
    entityId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    contentType: z.string().refine((t) => t in ALLOWED_MIME, "Tipo de archivo no permitido"),
    size: z.number().int().positive().max(MAX_EVIDENCE_BYTES),
  }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    const needed = data.kind === "POD" ? "pod.create" : data.kind === "DOCUMENT" ? "documents.create" : "inspections.create";
    await authorize(ws.profile, needed, { targetId: data.entityId });
    const sql = await getSql();
    if (data.kind === "POD") {
      const svc = await loadVisibleService(ws, data.entityId);
      if (!svc || (scopeOf(ws.profile, "pod") === "ASSIGNED" && svc.driver_id !== ws.profile.driver_id)) {
        await auditDenied(ws.profile, needed, { targetId: data.entityId });
        throw new Error(NOT_FOUND);
      }
    } else if (data.kind === "DOCUMENT") {
      // El id de entidad es el servicio/vehículo/etc. dueño; aquí el documento aún no existe: se liga a la empresa.
      if (scopeOf(ws.profile, "documents") !== "COMPANY") throw new Error(NOT_FOUND);
    } else {
      const insp = (await sql<{ id: string; user_id: string | null }>`select id, user_id from inspections where id = ${data.entityId} and company_id = ${ws.company.id}`)[0];
      if (!insp || (scopeOf(ws.profile, "inspections") === "OWN" && insp.user_id !== ws.profile.user_id)) throw new Error(NOT_FOUND);
    }
    const key = buildEvidenceKey(ws.company.id, data.kind, data.entityId, data.contentType, crypto.randomUUID());
    // Token firmado (HMAC) ligado a clave + usuario + tipo; solo con él `uploadEvidenceBlob` acepta la subida.
    const { signUploadToken, UPLOAD_TTL_SEC } = await import("../security/signing.server");
    const token = signUploadToken({ key, userId: context.userId, contentType: data.contentType });
    return { key, token, maxBytes: MAX_EVIDENCE_BYTES, expiresInSeconds: UPLOAD_TTL_SEC };
  });

/** URL firmada de corta vida, SOLO tras validar empresa + scope del propietario. */
export const getEvidenceUrl = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["POD", "DOCUMENT"]), id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    const needed = data.kind === "POD" ? "pod.read" : "documents.read";
    await authorize(ws.profile, needed, { targetId: data.id });
    const sql = await getSql();
    const deny = async () => { await auditDenied(ws.profile, needed, { targetId: data.id }); throw new Error(NOT_FOUND); };
    let key = "";
    if (data.kind === "POD") {
      const ev = (await sql<{ service_id: string; photo_key: string }>`select service_id, photo_key from delivery_evidence where id = ${data.id} and company_id = ${ws.company.id}`)[0];
      if (!ev) return deny();
      const svc = await loadVisibleService(ws, ev.service_id); // company + trip/assignment + driver/client
      if (!svc || (scopeOf(ws.profile, "pod") === "ASSIGNED" && svc.driver_id !== ws.profile.driver_id)) return deny();
      key = ev.photo_key;
      if (key && !keyBelongsTo(key, ws.company.id, "POD", ev.service_id)) return deny();
    } else {
      const doc = (await sql<{ owner_type: string; owner_id: string; storage_key: string }>`select owner_type, owner_id, storage_key from documents where id = ${data.id} and company_id = ${ws.company.id}`)[0];
      if (!doc) return deny();
      const scope = await getAccessScope(ws.profile);
      let ok = scopeOf(ws.profile, "documents") === "COMPANY";
      if (!ok) {
        const t = doc.owner_type.toUpperCase();
        if (t === "SERVICE") ok = !!(await loadVisibleService(ws, doc.owner_id));
        else if (t === "DRIVER") ok = scope.forcedDriverId === doc.owner_id;
        else if (t === "CLIENT") ok = scope.forcedClientId === doc.owner_id;
        else if (t === "VEHICLE") ok = !!scope.allowedVehicleIds?.includes(doc.owner_id);
      }
      if (!ok) return deny();
      key = doc.storage_key;
      if (key && !keyBelongsTo(key, ws.company.id, "DOCUMENT")) return deny();
    }
    if (!key) throw new Error(NOT_FOUND);
    const blob = (await sql<{ content_type: string }>`
      select content_type from evidence_blobs where key = ${key} and company_id = ${ws.company.id}
    `)[0];
    if (!blob) throw new Error(NOT_FOUND);
    await writeAudit(ws.company.id, context.userId, "EVIDENCE_ACCESSED", data.kind, data.id, "");
    // URL realmente firmada: ligada a clave + usuario y con expiración verificada por /api/files.
    const { signFileToken } = await import("../security/signing.server");
    const t = signFileToken({ key, userId: context.userId });
    return { url: `/api/files?key=${encodeURIComponent(key)}&u=${encodeURIComponent(context.userId)}&t=${t}`, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
  });

export const uploadEvidenceBlob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    key: z.string().min(8).max(240),
    token: z.string().min(16).max(200),
    contentType: z.string().refine((t) => t in ALLOWED_MIME, "Tipo de archivo no permitido"),
    dataBase64: z.string().min(8).max(14_000_000),
  }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    // 1) La clave debe ser de la empresa, con forma válida y extensión coherente con el tipo declarado.
    const [, kindRaw = "", entityId = "", file = ""] = data.key.split("/");
    const kind = EVIDENCE_KINDS.find((k) => k.toLowerCase() === kindRaw);
    if (!kind || !keyBelongsTo(data.key, ws.company.id, kind) || !file.endsWith(`.${ALLOWED_MIME[data.contentType]}`)) {
      throw new Error(NOT_FOUND);
    }
    // 2) Token emitido por createEvidenceUpload para ESTE usuario, clave y tipo (y vigente).
    const { verifyUploadToken } = await import("../security/signing.server");
    if (!verifyUploadToken(data.token, { key: data.key, userId: context.userId, contentType: data.contentType })) {
      throw new Error(NOT_FOUND);
    }
    // 3) El permiso se vuelve a comprobar: el rol pudo cambiar tras emitir el token.
    const needed = kind === "POD" ? "pod.create" : kind === "DOCUMENT" ? "documents.create" : "inspections.create";
    await authorize(ws.profile, needed, { targetId: entityId });
    if (!(await dbRateLimit(`evidence-upload:${context.userId}`, 30))) throw new Error("Demasiadas subidas. Intenta en un minuto.");
    // 4) Tamaño y contenido reales.
    const buf = Buffer.from(data.dataBase64, "base64");
    if (!buf.length || buf.byteLength > MAX_EVIDENCE_BYTES) throw new Error("Archivo demasiado grande");
    if (!matchesMagic(data.contentType, buf)) throw new Error("El contenido no coincide con el tipo de archivo");
    const sql = await getSql();
    // Sin `on conflict do update`: una clave ya escrita es inmutable (nadie sobrescribe un POD existente).
    const inserted = await sql<{ key: string }>`
      insert into evidence_blobs (key, company_id, content_type, bytes)
      values (${data.key}, ${ws.company.id}, ${data.contentType}, ${buf})
      on conflict (key) do nothing
      returning key
    `;
    if (!inserted[0]) throw new Error("La evidencia ya fue subida");
    await writeAudit(ws.company.id, context.userId, "EVIDENCE_UPLOADED", kind, entityId, JSON.stringify({ bytes: buf.byteLength }));
    return { ok: true, key: data.key };
  });
