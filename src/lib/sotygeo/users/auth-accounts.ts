import { hashPassword } from "better-auth/crypto";
import { getSql, type Sql } from "@/lib/db";
import { nid } from "../db";

/** Create a local email/password identity in Better Auth tables. */
export async function createCredentialUser(
  opts: { email: string; password: string; name: string; emailVerified?: boolean },
  db?: Sql,
): Promise<string> {
  // The caller can provide the active transaction so user + credential creation
  // rolls back together with the SOTYGEO membership when activation fails.
  const sql = db ?? (await getSql());
  const id = nid();
  const email = opts.email.trim().toLowerCase();
  const password = await hashPassword(opts.password);
  await sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${id}, ${opts.name}, ${email}, ${opts.emailVerified ?? false}, now(), now())
  `;
  await sql`
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${nid()}, ${id}, 'credential', ${id}, ${password}, now(), now())
  `;
  return id;
}

export async function setCredentialPasswordHash(userId: string, passwordHash: string, db?: Sql): Promise<void> {
  const sql = db ?? (await getSql());
  const existing = await sql<{ id: string }>`
    select id from account where "userId" = ${userId} and "providerId" = 'credential'
  `;
  if (existing[0]) {
    await sql`update account set password = ${passwordHash}, "updatedAt" = now() where id = ${existing[0].id}`;
    return;
  }
  await sql`
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${nid()}, ${userId}, 'credential', ${userId}, ${passwordHash}, now(), now())
  `;
}

export async function setCredentialPassword(userId: string, password: string, db?: Sql): Promise<void> {
  const hash = await hashPassword(password);
  return setCredentialPasswordHash(userId, hash, db);
}

export async function revokeSessions(userId: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from session where "userId" = ${userId}`;
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from "user" where id = ${userId}`;
}
