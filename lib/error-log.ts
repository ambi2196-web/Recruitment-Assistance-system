import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { briefs, errorFlags, requirements, screeningKits } from "./db/schema";
import { WorkflowError } from "./requirements";

export type WrongTarget = "brief" | "kit";

const AGENTS: Record<WrongTarget, string> = { brief: "a2_recruiter_brief", kit: "a3_screening_kit" };

async function requirementOf(db: Db, target: WrongTarget, targetId: number) {
  const [row] =
    target === "brief"
      ? await db
          .select({ id: requirements.id, assignedRecruiterId: requirements.assignedRecruiterId })
          .from(briefs)
          .innerJoin(requirements, eq(briefs.requirementId, requirements.id))
          .where(eq(briefs.id, targetId))
      : await db
          .select({ id: requirements.id, assignedRecruiterId: requirements.assignedRecruiterId })
          .from(screeningKits)
          .innerJoin(briefs, eq(screeningKits.briefId, briefs.id))
          .innerJoin(requirements, eq(briefs.requirementId, requirements.id))
          .where(eq(screeningKits.id, targetId));
  if (!row) throw new WorkflowError("That line could not be found.");
  return row;
}

/** The recruiter's "Wrong" click: the main defence against model errors (section 16). */
export async function flagWrongLine(
  context: { db: Db; userId: number },
  input: { target: WrongTarget; targetId: number; lineRef: string; note: string },
): Promise<void> {
  const { db, userId } = context;
  if (!(input.target in AGENTS)) throw new WorkflowError("That line could not be found.");

  const requirement = await requirementOf(db, input.target, input.targetId);
  if (requirement.assignedRecruiterId !== userId) throw new WorkflowError("Only the assigned recruiter can flag this line.");

  await db.insert(errorFlags).values({
    targetType: input.target,
    targetId: input.targetId,
    requirementId: requirement.id,
    agent: AGENTS[input.target],
    lineRef: input.lineRef,
    note: input.note.trim() || null,
    reportedBy: userId,
  });
}

// A link to the commit is shown to the admin, so only web links are accepted.
export async function markPromptFixed(db: Db, flagId: number, commitLink: string): Promise<void> {
  const link = commitLink.trim();
  if (!/^https?:\/\/\S+$/i.test(link)) throw new WorkflowError("Please paste a link to the commit.");
  await db.update(errorFlags).set({ status: "prompt_fixed", fixedCommit: link }).where(eq(errorFlags.id, flagId));
}
