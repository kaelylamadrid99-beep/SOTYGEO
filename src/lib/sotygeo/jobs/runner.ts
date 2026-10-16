import { getSql } from "@/lib/db";
import { insert, nid, notify } from "../db";
import { tickCompany, insertAlert } from "../gps/engine";
import { publishDomainEvent } from "../events/bus";
import { logJobFailure, logStructured } from "../observability";

const DAILY = 24 * 60;
const g = globalThis as typeof globalThis & { __sotygeoJobsStarted__?: boolean; __sotygeoJobsRunning__?: boolean; __sotygeoLastHousekeepingAt__?: number };

export function ensureJobsStarted(): void {
  // En Vercel (serverless) las instancias se congelan: un setInterval no es fiable.
  // Allí los trabajos los dispara Vercel Cron (/api/cron/jobs, ver vercel.json).
  if (process.env.VERCEL) return;
  if (g.__sotygeoJobsStarted__) return;
  g.__sotygeoJobsStarted__ = true;
  void runAllJobs().catch(() => undefined);
  setInterval(() => {
    void runAllJobs().catch(() => undefined);
  }, 4000);
}

export async function runAllJobs(opts: { force?: boolean } = {}): Promise<void> {
  if (g.__sotygeoJobsRunning__) return;
  g.__sotygeoJobsRunning__ = true;
  try {
    const sql = await getSql();
    const companies = await sql<{ id: string }>`select id from companies`;
    logStructured("debug", "jobs_tick", { event: "JOBS_TICK", companyCount: companies.length, force: Boolean(opts.force) });
    for (const c of companies) await tickCompany(c.id);

    const now = Date.now();
    const lastHousekeeping = g.__sotygeoLastHousekeepingAt__ ?? 0;
    // `force` (cron): cada invocación es una instancia fría o distinta; no hay estado global fiable.
    if (!opts.force && now - lastHousekeeping < 60_000) return;
    g.__sotygeoLastHousekeepingAt__ = now;

    for (const c of companies) {
      await expireDocuments(c.id);
      await expireLicenses(c.id);
      await dueMaintenance(c.id);
      await cleanupTokens(c.id);
    }
    await flushQueuedEmails();
    const { deliverOutbox } = await import("../users/lifecycle");
    await deliverOutbox().catch((e) => {
      logJobFailure("outbox-deliver", e);
    });
    // Cada hora real. La compuerta vive en BD (job_runs) para que valga entre
    // instancias; antes `now % 1h < 4.5s` solo coincidía ~7% de las veces.
    const lastRetention = await sql<{ n: number }>`
      select count(*)::int as n from job_runs where job_name = 'gps-retention' and started_at > now() - interval '1 hour'`;
    if ((lastRetention[0]?.n ?? 0) === 0) {
      await recordJobRun("gps-retention", "SUCCESS");
      await retainGpsHistory();
    }
  } finally {
    g.__sotygeoJobsRunning__ = false;
  }
}

async function expireLicenses(companyId: string) {
  const sql = await getSql();
  const expiring = await sql<{ id: string; name: string; license_expires_at: string }>`
    select id, name, license_expires_at::text as license_expires_at from drivers
    where company_id = ${companyId}
      and license_expires_at is not null
      and license_expires_at <= (current_date + 30)
      and status <> 'INACTIVE'
  `;
  for (const d of expiring) {
    await notify({
      companyId,
      title: "Licencia próxima a vencer",
      body: `${d.name} · vence ${d.license_expires_at}`,
      kind: "LICENSE_EXPIRING",
      entityId: d.id,
      dedupeMinutes: DAILY,
    });
  }
}

async function expireDocuments(companyId: string) {
  const sql = await getSql();
  await sql`
    update documents set status = 'EXPIRED'
    where company_id = ${companyId} and expires_at is not null and expires_at < current_date and status <> 'EXPIRED'
  `;
  await sql`
    update documents set status = 'EXPIRING'
    where company_id = ${companyId}
      and expires_at is not null
      and expires_at <= (current_date + 30)
      and expires_at >= current_date
      and status = 'VALID'
  `;
  const rows = await sql<{ id: string; title: string; expires_at: string }>`
    select id, title, expires_at::text as expires_at from documents
    where company_id = ${companyId} and status in ('EXPIRING','EXPIRED')
      and expires_at <= (current_date + 30)
  `;
  for (const d of rows) {
    await notify({
      companyId,
      title: "Documento por vencer",
      body: `${d.title} · ${d.expires_at}`,
      kind: "DOCUMENT_EXPIRING",
      entityId: d.id,
      dedupeMinutes: DAILY,
    });
    await insertAlert(companyId, {
      type: "DOCUMENT_EXPIRING",
      severity: "WARNING",
      title: "Documento por vencer",
      body: `${d.title} · ${d.expires_at}`,
      entityType: "DOCUMENT",
      entityId: d.id,
      dedupeMinutes: null,
    });
    publishDomainEvent({ companyId, type: "DOCUMENT_EXPIRING", entityType: "DOCUMENT", entityId: d.id });
  }
}

async function dueMaintenance(companyId: string) {
  const sql = await getSql();
  const due = await sql<{ id: string; title: string; vehicle_id: string }>`
    select p.id, p.title, p.vehicle_id
    from maintenance_plans p
    join vehicles v on v.id = p.vehicle_id
    where p.company_id = ${companyId} and p.status = 'ACTIVE'
      and (
        (p.next_due_at is not null and p.next_due_at <= current_date)
        or (p.next_due_km is not null and v.odometer_km >= p.next_due_km)
      )
  `;
  for (const p of due) {
    await insertAlert(companyId, {
      type: "MAINTENANCE_DUE",
      severity: "WARNING",
      title: "Mantenimiento pendiente",
      body: p.title,
      entityType: "MAINTENANCE",
      entityId: p.id,
      vehicleId: p.vehicle_id,
      dedupeMinutes: null,
    });
    publishDomainEvent({ companyId, type: "MAINTENANCE_DUE", entityType: "VEHICLE", entityId: p.vehicle_id });
  }
}

async function cleanupTokens(companyId: string) {
  const sql = await getSql();
  await sql`
    update tracking_links set status = 'EXPIRED'
    where company_id = ${companyId} and status = 'ACTIVE' and expires_at < now() and revoked_at is null
  `;
  await sql`delete from rate_limits where created_at < now() - interval '1 day'`;
  await sql`
    delete from password_resets
    where expires_at is not null and expires_at < now() - interval '7 days'
  `;
}

async function retainGpsHistory() {
  const sql = await getSql();
  await sql`delete from gps_positions where recorded_at < now() - interval '90 days'`;
  await sql`delete from gps_ingest_events where created_at < now() - interval '14 days'`;
  await sql`delete from gps_ingest_errors where created_at < now() - interval '14 days'`;
  await sql`delete from job_runs where started_at < now() - interval '30 days'`;
  await sql`delete from email_verifications where expires_at < now() - interval '7 days'`;
  await sql`delete from domain_events where created_at < now() - interval '14 days'`;
}

async function flushQueuedEmails() {
  const sql = await getSql();
  const rows = await sql<{ id: string; title: string; body: string; user_id: string | null }>`
    select id, title, body, user_id
    from notifications
    where email_queued = true
      and created_at > now() - interval '10 minutes'
    order by created_at asc
    limit 25
  `;
  if (!rows.length) return;
  const { sendEmail } = await import("../notifications/email.server");
  const { notificationEmail } = await import("../notifications/templates");
  for (const n of rows) {
    if (!n.user_id) {
      await sql`update notifications set email_queued = false where id = ${n.id}`;
      continue;
    }
    const users = await sql<{ email: string | null }>`
      select email from "user" where id = ${n.user_id} limit 1
    `;
    const to = users[0]?.email?.trim().toLowerCase();
    if (!to || !to.includes("@")) {
      await sql`update notifications set email_queued = false where id = ${n.id}`;
      continue;
    }
    const result = await sendEmail({ to, ...notificationEmail(n.title, n.body) });
    if (result.ok) {
      await sql`update notifications set email_queued = false where id = ${n.id}`;
    }
  }
}

export async function recordJobRun(jobName: string, status: string, details = "", companyId: string | null = null) {
  const sql = await getSql();
  await insert(sql, "job_runs", {
    id: nid(),
    company_id: companyId,
    job_name: jobName,
    status,
    finished_at: new Date().toISOString(),
    details,
  });
}
