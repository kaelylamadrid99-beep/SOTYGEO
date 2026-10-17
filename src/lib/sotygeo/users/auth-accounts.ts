import type { Sql } from "@/lib/db";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Create a Lovable Cloud email/password account (used for invitation acceptance). */
export async function createCredentialUser(
  opts: { email: string; password: string; name: string; emailVerified?: boolean },
  _db?: Sql,
): Promise<string> {
  const a = await admin();
  const { data, error } = await a.auth.admin.createUser({
    email: opts.email.trim().toLowerCase(),
    password: opts.password,
    email_confirm: opts.emailVerified ?? true,
    user_metadata: { full_name: opts.name },
  });
  if (error || !data.user) throw new Error(error?.message ?? "No se pudo crear la cuenta");
  return data.user.id;
}

export async function setCredentialPassword(userId: string, password: string, _db?: Sql): Promise<void> {
  const a = await admin();
  const { error } = await a.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
}

export async function revokeSessions(_userId: string): Promise<void> {
  /* Disabled profiles are rejected on every request by the app's permission checks. */
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const a = await admin();
  await a.auth.admin.deleteUser(userId);
}
