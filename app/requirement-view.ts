import { asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { RequirementCheck } from "@/lib/agents/a1_requirement_check";
import { getDb } from "@/lib/db";
import { clients, requirementActions, requirementChecks, requirements, users } from "@/lib/db/schema";
import { latestBrief } from "@/lib/requirements";

export async function loadRequirementView(rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const db = getDb();
  const [row] = await db
    .select({ requirement: requirements, client: clients })
    .from(requirements)
    .innerJoin(clients, eq(requirements.clientId, clients.id))
    .where(eq(requirements.id, id));
  if (!row) notFound();

  const [check] = await db
    .select()
    .from(requirementChecks)
    .where(eq(requirementChecks.requirementId, id))
    .orderBy(desc(requirementChecks.id))
    .limit(1);

  const actions = await db
    .select({ action: requirementActions, userName: users.name })
    .from(requirementActions)
    .innerJoin(users, eq(requirementActions.userId, users.id))
    .where(eq(requirementActions.requirementId, id))
    .orderBy(asc(requirementActions.id));

  return { ...row, check: check ?? null, checkJson: check?.json as RequirementCheck | undefined, brief: await latestBrief(db, id), actions };
}
