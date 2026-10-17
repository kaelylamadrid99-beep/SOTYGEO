import { supabase } from "@/integrations/supabase/client";

/** Sign-in is always on (Lovable Cloud auth). */
export const authEnabled = true;
export const oauthEnabled = false;
export function useOAuthEnabled() {
  return false;
}
export const GROK_PROVIDERS: readonly { providerId: string; label: string }[] = [];

let cachedToken: string | null = null;
if (typeof window !== "undefined") {
  void supabase.auth.getSession().then(({ data }) => {
    cachedToken = data.session?.access_token ?? null;
  });
  supabase.auth.onAuthStateChange((_e, session) => {
    cachedToken = session?.access_token ?? null;
  });
}

export function getBearerToken(): string | null {
  return cachedToken;
}

export async function getFreshBearerToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  cachedToken = data.session?.access_token ?? null;
  return cachedToken;
}

export function setBearerToken(_token: string | null): void {
  /* sessions are managed by Lovable Cloud */
}

export async function signIn(_providerId: string, _opts?: unknown): Promise<void> {
  throw new Error("Proveedor no disponible");
}

export async function signOut(redirectTo = "/login"): Promise<void> {
  await supabase.auth.signOut();
  if (typeof window !== "undefined") window.location.href = redirectTo;
}
