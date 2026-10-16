/** Helpers puros de idempotencia de jobs y secuencia GPS (Fase 8). */

export function shouldRunScheduledJob(recentSuccessfulRuns: number): boolean {
  return (recentSuccessfulRuns ?? 0) === 0;
}

export function claimSequence(current: number | null | undefined, incoming: number): boolean {
  if (!Number.isFinite(incoming) || incoming < 0) return false;
  if (current == null) return true;
  return incoming > current;
}

export function applyConcurrentSequences(initial: number | null, arrivals: number[]) {
  let current = initial;
  const accepted: number[] = [];
  const rejected: number[] = [];
  for (const seq of arrivals) {
    if (claimSequence(current, seq)) {
      current = seq;
      accepted.push(seq);
    } else {
      rejected.push(seq);
    }
  }
  return { final: current, accepted, rejected };
}

export function isDuplicateEventKey(seen: Set<string>, eventKey: string): boolean {
  if (seen.has(eventKey)) return true;
  seen.add(eventKey);
  return false;
}

export type OutboxRow = { id: string; delivered: boolean; attempts: number };

export function selectOutboxBatch(rows: OutboxRow[], maxAttempts = 5, limit = 25): OutboxRow[] {
  return rows.filter((r) => !r.delivered && r.attempts < maxAttempts).slice(0, limit);
}

export function nextOutboxAttempt(row: OutboxRow, ok: boolean): OutboxRow {
  if (ok) return { ...row, delivered: true, attempts: row.attempts + 1 };
  return { ...row, delivered: false, attempts: row.attempts + 1 };
}
