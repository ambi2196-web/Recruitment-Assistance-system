import { asc, desc, eq } from "drizzle-orm";
import { runRequirementCheck, type RequirementCheck } from "./agents/a1_requirement_check";
import { runRecruiterBrief, type RecruiterBrief } from "./agents/a2_recruiter_brief";
import { wrapUntrusted } from "./agents/untrusted";
import { diffBriefs } from "./brief-diff";
import type { Db } from "./db";
import { briefs, clientAnswers, clients, requirementActions, requirementChecks, requirements } from "./db/schema";
import { loadRegistry, LlmBlockedError, LlmOutputError, type LlmProvider } from "./llm";
import { redact, type Registry } from "./redaction";

// The order of agents lives here. Agents never call each other (section 11.3).

/** A problem with a message that is safe to show the user. */
export class WorkflowError extends Error {}

export const SKIP_REASONS = ["Urgent", "Client unreachable", "Requirement already clear", "Other"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

type Context = { db: Db; userId: number; provider?: LlmProvider };

function redactOrThrow(text: string, registry: Registry) {
  const result = redact(text, registry);
  if (!result.ok) throw new WorkflowError(`Stopped before any AI call: ${result.reason}`);
  return result.text;
}

const logAction = ({ db, userId }: Context, requirementId: number, action: string, detail?: unknown) =>
  db.insert(requirementActions).values({ requirementId, userId, action, detail });

async function loadRequirement(db: Db, id: number) {
  const [row] = await db
    .select({ requirement: requirements, client: clients })
    .from(requirements)
    .innerJoin(clients, eq(requirements.clientId, clients.id))
    .where(eq(requirements.id, id));
  if (!row) throw new WorkflowError("Requirement not found.");
  return row;
}

const setStatus = (db: Db, id: number, status: typeof requirements.$inferInsert.status) =>
  db.update(requirements).set({ status, updatedAt: new Date() }).where(eq(requirements.id, id));

export async function createRequirement(
  context: Context,
  input: { subject: string; body: string; clientId: number },
): Promise<number> {
  const { db, userId } = context;
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) throw new WorkflowError("Please add both the subject and the email text.");

  const registry = await loadRegistry(db);
  const originalText = `Subject: ${subject}\n\n${body}`;
  const redactedText = redactOrThrow(originalText, registry);

  const [created] = await db
    .insert(requirements)
    .values({
      clientId: input.clientId,
      // Titles appear in lists, so they must be redacted as well.
      title: redactOrThrow(subject, registry),
      originalText,
      redactedText,
      createdBy: userId,
      assignedRecruiterId: userId,
    })
    .returning({ id: requirements.id });

  await logAction(context, created.id, "created");
  return created.id;
}

export async function checkRequirement(context: Context, requirementId: number): Promise<void> {
  const { db, userId, provider } = context;
  const { requirement, client } = await loadRequirement(db, requirementId);

  const input = redactOrThrow(
    `Industry: ${client.industryLabel}\n\n${wrapUntrusted("REQUIREMENT", requirement.redactedText)}`,
    await loadRegistry(db),
  );
  const result = await runRequirementCheck(input, { db, userId, provider, linkedRecordId: `requirement:${requirementId}` });

  await db.insert(requirementChecks).values({
    requirementId,
    json: result.data,
    model: result.model,
    promptVersion: result.promptVersion,
  });
  await setStatus(db, requirementId, "checked");
}

async function latestCheck(db: Db, requirementId: number) {
  const [row] = await db
    .select()
    .from(requirementChecks)
    .where(eq(requirementChecks.requirementId, requirementId))
    .orderBy(desc(requirementChecks.id))
    .limit(1);
  if (!row) throw new WorkflowError("This requirement has not been checked yet.");
  return row;
}

export async function latestBrief(db: Db, requirementId: number) {
  const [row] = await db
    .select()
    .from(briefs)
    .where(eq(briefs.requirementId, requirementId))
    .orderBy(desc(briefs.version))
    .limit(1);
  return row ?? null;
}

export async function generateBrief(context: Context, requirementId: number): Promise<void> {
  const { db, userId, provider } = context;
  const { requirement } = await loadRequirement(db, requirementId);
  const check = await latestCheck(db, requirementId);
  const answers = await db
    .select()
    .from(clientAnswers)
    .where(eq(clientAnswers.requirementId, requirementId))
    .orderBy(asc(clientAnswers.id));
  const previous = await latestBrief(db, requirementId);

  // Model output and stored text are redacted again together,
  // because a model can repeat or rebuild something sensitive.
  const input = redactOrThrow(
    [
      `Sourced on assumption: ${requirement.sourcedOnAssumption ? "yes" : "no"}`,
      wrapUntrusted("REQUIREMENT", requirement.redactedText),
      wrapUntrusted("REQUIREMENT_CHECK", JSON.stringify(check.json)),
      ...answers.map((answer) => wrapUntrusted("CLIENT_ANSWER", answer.textRedacted)),
    ].join("\n\n"),
    await loadRegistry(db),
  );

  const result = await runRecruiterBrief(input, { db, userId, provider, linkedRecordId: `requirement:${requirementId}` });

  await db.insert(briefs).values({
    requirementId,
    version: (previous?.version ?? 0) + 1,
    json: result.data,
    whatChanged: previous ? diffBriefs(previous.json as RecruiterBrief, result.data) : null,
    model: result.model,
    promptVersion: result.promptVersion,
  });
}

async function requireStatus(db: Db, requirementId: number, allowed: string[]) {
  const { requirement } = await loadRequirement(db, requirementId);
  if (!allowed.includes(requirement.status)) {
    throw new WorkflowError("This step has already been done, or is not ready yet.");
  }
}

/** The stakeholder sends the questions from their own mailbox. The desk sends nothing (G2). */
export async function sendQuestions(context: Context, requirementId: number, questions: string[]): Promise<void> {
  const { db } = context;
  await requireStatus(db, requirementId, ["checked"]);

  const cleaned = questions.map((q) => q.trim()).filter(Boolean);
  if (cleaned.length === 0) throw new WorkflowError("Please keep at least one question.");

  const original = ((await latestCheck(db, requirementId)).json as RequirementCheck).client_questions;
  const edited = JSON.stringify(cleaned) !== JSON.stringify(original);

  await logAction(context, requirementId, edited ? "edit_and_send" : "send", { questions: cleaned });
  await setStatus(db, requirementId, "clarifying");
  await generateBrief(context, requirementId);
}

export async function skipQuestions(context: Context, requirementId: number, reason: string): Promise<void> {
  const { db } = context;
  await requireStatus(db, requirementId, ["checked"]);
  if (!SKIP_REASONS.includes(reason as SkipReason)) throw new WorkflowError("Please choose a reason.");

  await db
    .update(requirements)
    .set({ status: "released", sourcedOnAssumption: true, skipReason: reason, updatedAt: new Date() })
    .where(eq(requirements.id, requirementId));
  await logAction(context, requirementId, "skip", { reason });
  await generateBrief(context, requirementId);
}

export async function addClientAnswer(context: Context, requirementId: number, text: string): Promise<void> {
  const { db, userId } = context;
  await requireStatus(db, requirementId, ["clarifying", "released", "active"]);
  if (!text.trim()) throw new WorkflowError("Please paste the client's answer.");

  const textRedacted = redactOrThrow(text.trim(), await loadRegistry(db));
  await db.insert(clientAnswers).values({ requirementId, textRedacted, createdBy: userId });
  await logAction(context, requirementId, "client_answer");
  await setStatus(db, requirementId, "active");
  await generateBrief(context, requirementId);
}

/** Puts the real client name back. Only for the stakeholder's copy-ready text (FR-3.2). */
export const restoreClientName = (text: string, client: { code: string; name: string }) =>
  text.replaceAll(client.code, client.name);

/** Turns the desk's safe errors into a message, and rethrows anything unexpected. */
export function safeMessage(error: unknown): string {
  if (error instanceof WorkflowError || error instanceof LlmBlockedError || error instanceof LlmOutputError) return error.message;
  throw error;
}
