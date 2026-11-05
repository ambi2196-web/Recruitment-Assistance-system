import { and, desc, gte, lt, ne } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { runWeeklyDigest } from "./agents/a5_weekly_digest";
import { wrapUntrusted } from "./agents/untrusted";
import type { Db } from "./db";
import { clients, requirements, submissions, weeklyDigests } from "./db/schema";
import { loadRegistry, type LlmProvider } from "./llm";
import { redact } from "./redaction";
import { WorkflowError } from "./requirements";

export type DigestRow = {
  client_code: string;
  submissions: number;
  interviews: number;
  rejections_by_reason: Record<string, number>;
  skipped_submissions: number;
  skipped_interviews: number;
  clarified_submissions: number;
  clarified_interviews: number;
};

const INTERVIEW_STATUSES = ["interview", "selected"];

// Notes may name people, so only the fixed reason before the colon is kept.
const reasonLabel = (reason: string) => reason.split(":")[0];

/** Counts per client code. Code builds this, so A5 can never see one candidate's data. */
export async function buildDigestTable(db: Db, from: Date, to: Date): Promise<DigestRow[]> {
  const rows = await db
    .select({
      status: submissions.status,
      rejectReason: submissions.rejectReason,
      outcomeReason: submissions.outcomeReason,
      clientCode: clients.code,
      skipped: requirements.sourcedOnAssumption,
    })
    .from(submissions)
    .innerJoin(requirements, eq(submissions.requirementId, requirements.id))
    .innerJoin(clients, eq(requirements.clientId, clients.id))
    .where(and(ne(submissions.status, "draft"), gte(submissions.submittedAt, from), lt(submissions.submittedAt, to)));

  const table = new Map<string, DigestRow>();
  for (const row of rows) {
    const entry = table.get(row.clientCode) ?? {
      client_code: row.clientCode,
      submissions: 0,
      interviews: 0,
      rejections_by_reason: {},
      skipped_submissions: 0,
      skipped_interviews: 0,
      clarified_submissions: 0,
      clarified_interviews: 0,
    };
    table.set(row.clientCode, entry);

    const interviewed = INTERVIEW_STATUSES.includes(row.status);
    entry.submissions += 1;
    if (interviewed) entry.interviews += 1;
    if (row.skipped) {
      entry.skipped_submissions += 1;
      if (interviewed) entry.skipped_interviews += 1;
    } else {
      entry.clarified_submissions += 1;
      if (interviewed) entry.clarified_interviews += 1;
    }

    const reason = row.outcomeReason ?? row.rejectReason;
    if (reason) {
      const label = reasonLabel(reason);
      entry.rejections_by_reason[label] = (entry.rejections_by_reason[label] ?? 0) + 1;
    }
  }

  return [...table.values()].sort((a, b) => a.client_code.localeCompare(b.client_code));
}

const WEEK_MS = 7 * 86_400_000;

export async function generateDigest(context: { db: Db; userId?: number; provider?: LlmProvider }, now = new Date()): Promise<void> {
  const { db, userId, provider } = context;
  const periodStart = new Date(now.getTime() - WEEK_MS);

  const table = await buildDigestTable(db, periodStart, now);
  if (table.length === 0) throw new WorkflowError("There were no submissions in the last 7 days.");

  const input = redact(wrapUntrusted("AGGREGATED_TABLE", JSON.stringify(table)), await loadRegistry(db));
  if (!input.ok) throw new WorkflowError(`Stopped before any AI call: ${input.reason}`);

  const result = await runWeeklyDigest(input.text, { db, userId, provider });

  await db.insert(weeklyDigests).values({
    periodStart,
    periodEnd: now,
    tableJson: table,
    observationsJson: result.data.observations,
    model: result.model,
    promptVersion: result.promptVersion,
  });
}

export async function latestDigest(db: Db) {
  const [row] = await db.select().from(weeklyDigests).orderBy(desc(weeklyDigests.id)).limit(1);
  return row ? { ...row, table: row.tableJson as DigestRow[], observations: row.observationsJson as string[] } : null;
}
