import { getRequest } from "@tanstack/react-start/server";

export const authConfigured = true;

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

async function verifyToken(token: string): Promise<VerifiedUser | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

function tokenFromRequest(request: Request | undefined): string | null {
  const h = request?.headers.get("authorization") ?? "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim() || null;
  return null;
}

/** Verified session user for server routes (Authorization: Bearer <access token>). */
export async function getSessionUser(request?: Request): Promise<VerifiedUser | null> {
  let req = request;
  if (!req) {
    try {
      req = getRequest();
    } catch {
      req = undefined;
    }
  }
  const token = tokenFromRequest(req);
  if (!token) return null;
  return verifyToken(token);
}

export async function requireUserId(bearerToken?: string): Promise<string> {
  const token = bearerToken ?? tokenFromRequest((() => { try { return getRequest(); } catch { return undefined; } })());
  if (!token) throw new UnauthorizedError();
  const user = await verifyToken(token);
  if (!user) throw new UnauthorizedError();
  return user.id;
}
