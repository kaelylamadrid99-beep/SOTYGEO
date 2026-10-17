/**
 * Server-only SQL client backed by Lovable Cloud.
 * Queries run through the service-role-only `exec_sql` database function, so the
 * existing parameterized SQL (`sql\`...${v}\``, `sql.query(text, params)`) keeps working.
 * Note: `withTransaction` groups statements logically but each statement commits on its own.
 */
export interface Sql {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export type DbSource = "cloud";
export const dbSource: DbSource = "cloud";

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

function pgArray(arr: unknown[]): string {
  return (
    "{" +
    arr
      .map((v) => (v === null || v === undefined ? "NULL" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`))
      .join(",") +
    "}"
  );
}

function encodeParam(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return pgArray(v);
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Uint8Array) {
    let hex = "\\x";
    for (const b of v) hex += b.toString(16).padStart(2, "0");
    return hex;
  }
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return v;
}

const run: Run = async <T>(text: string, params: unknown[]) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  }).rpc("exec_sql", { query: text, params: params.map(encodeParam) });
  if (error) {
    const err = new Error(error.message) as Error & { code?: string };
    const m = /SQLSTATE[: ]+(\w{5})/.exec(error.message);
    err.code = error.code ?? m?.[1];
    if (/duplicate key/i.test(error.message)) err.code = "23505";
    throw err;
  }
  return (Array.isArray(data) ? data : []) as T[];
};

function toSql(r: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return r<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) => r<T>(text, params);
  return sql;
}

const shared = toSql(run);

export async function getSql(): Promise<Sql> {
  if (typeof window !== "undefined") throw new Error("@/lib/db is server-only");
  return shared;
}

export function ensureDbReady(): Promise<void> {
  return Promise.resolve();
}

export interface Tx extends Sql {
  assert(expr: string, params?: unknown[], message?: string): void;
}

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const pending: Promise<void>[] = [];
  const tx = toSql(run) as Tx;
  tx.assert = (expr, params = [], message = "") => {
    const check = (async () => {
      const rows = await run<{ ok: boolean }>(`select (${expr}) as ok`, params);
      if (!rows[0]?.ok) throw new Error(message || "aserción fallida");
    })();
    check.catch(() => undefined);
    pending.push(check);
  };
  const result = await fn(tx);
  await Promise.all(pending);
  return result;
}
