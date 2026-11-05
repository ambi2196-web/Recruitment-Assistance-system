import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { candidates, clients, requirements, submissionActions, submissions, users } from "@/lib/db/schema";
import type { Flag, FlagResolutions, StoredDraft } from "@/lib/submissions";

export async function loadSubmissionView(rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const db = getDb();
  const [row] = await db
    .select({ submission: submissions, candidate: candidates, requirement: requirements, client: clients })
    .from(submissions)
    .innerJoin(candidates, eq(submissions.candidateId, candidates.id))
    .innerJoin(requirements, eq(submissions.requirementId, requirements.id))
    .innerJoin(clients, eq(requirements.clientId, clients.id))
    .where(eq(submissions.id, id));
  if (!row) notFound();

  const log = await db
    .select({ action: submissionActions.action, userName: users.name, createdAt: submissionActions.createdAt })
    .from(submissionActions)
    .innerJoin(users, eq(submissionActions.userId, users.id))
    .where(eq(submissionActions.submissionId, id))
    .orderBy(asc(submissionActions.id));

  return {
    ...row,
    log,
    draft: row.submission.draftJson as StoredDraft,
    flags: row.submission.flagsJson as Flag[],
    resolutions: row.submission.flagResolutionsJson as FlagResolutions,
  };
}
