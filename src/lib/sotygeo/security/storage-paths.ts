/** Claves de Storage privado: SIEMPRE generadas por el servidor y ligadas a empresa. Puro y testeable. */
export const EVIDENCE_BUCKET = "sotygeo-private";
export const SIGNED_URL_TTL_SECONDS = 60;
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export const EVIDENCE_KINDS = ["POD", "DOCUMENT", "INSPECTION"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function buildEvidenceKey(companyId: string, kind: EvidenceKind, entityId: string, contentType: string, uuid: string): string {
  const ext = ALLOWED_MIME[contentType];
  if (!ext) throw new Error("Tipo de archivo no permitido");
  if (!ID.test(companyId) || !ID.test(entityId) || !ID.test(uuid)) throw new Error("Identificador no válido");
  return `${companyId}/${kind.toLowerCase()}/${entityId}/${uuid}.${ext}`;
}

/** La clave pertenece a la empresa (y, si se indica, al tipo/entidad). Sin ".." ni rutas absolutas. */
export function keyBelongsTo(key: string, companyId: string, kind?: EvidenceKind, entityId?: string): boolean {
  if (!key || key.includes("..") || key.startsWith("/") || key.includes("\\") || key.includes("//")) return false;
  const parts = key.split("/");
  if (parts.length !== 4) return false;
  const [c, k, e, file] = parts as [string, string, string, string];
  if (c !== companyId || !ID.test(c) || !ID.test(e) || !/^[A-Za-z0-9_-]+\.(jpg|png|webp|pdf)$/.test(file)) return false;
  if (kind && k !== kind.toLowerCase()) return false;
  if (entityId && e !== entityId) return false;
  return (EVIDENCE_KINDS as readonly string[]).includes(k.toUpperCase());
}

/** El contenido real coincide con el tipo declarado (no basta con confiar en `contentType`). */
export function matchesMagic(contentType: string, b: Uint8Array): boolean {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  switch (contentType) {
    case "image/jpeg": return at(0, 0xff, 0xd8, 0xff);
    case "image/png": return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/webp": return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
    case "application/pdf": return at(0, 0x25, 0x50, 0x44, 0x46, 0x2d);
    default: return false;
  }
}

export const isHttpsUrl = (u: string) => {
  try { return new URL(u).protocol === "https:"; } catch { return false; }
};
