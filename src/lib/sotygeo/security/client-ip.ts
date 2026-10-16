/**
 * IP del cliente para rate limiting. Puro (sin I/O).
 *
 * Orden de confianza: cabeceras que fija la plataforma (Vercel sobrescribe
 * `x-vercel-forwarded-for` / `x-real-ip`; no vienen del cliente) y solo después
 * `x-forwarded-for`. Sin ninguna, el bucket se separa por user-agent en lugar de
 * compartir un único "unknown" entre todos los clientes anónimos.
 */
export function clientIpFromHeaders(h: { get(name: string): string | null }): string {
  const first = (v: string | null) => v?.split(",")[0]?.trim() || "";
  const ip = first(h.get("x-vercel-forwarded-for")) || first(h.get("x-real-ip")) || first(h.get("x-forwarded-for"));
  if (ip && ip.length <= 64) return ip;
  const ua = (h.get("user-agent") ?? "").slice(0, 80);
  return `unknown:${ua}`;
}
