import { createClient } from "@supabase/supabase-js";

/** Public (anon) auth client for server-triggered auth emails (signup confirm, password reset). */
export function publicAuthClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (headers.get("authorization") === `Bearer ${key}`) headers.delete("authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export async function requestOrigin(): Promise<string> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  const origin = req.headers.get("origin");
  if (origin) return origin;
  return new URL(req.url).origin;
}
