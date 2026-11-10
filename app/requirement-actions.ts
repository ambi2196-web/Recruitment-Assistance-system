"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { clients, prospectTerms, users } from "@/lib/db/schema";
import {
  addClientAnswer,
  checkRequirement,
  createRequirement,
  generateBrief,
  safeMessage,
  sendQuestions,
  skipQuestions,
} from "@/lib/requirements";
import { getCurrentUser, requireRole } from "@/lib/session";
import type { Db } from "@/lib/db";
import type { MailClient } from "@/lib/mail/types";
import { notifyBriefReady, notifyCheckReady, processInbox } from "@/lib/mailbox";
import { gmailFromEnv } from "@/lib/mail/gmail";
import { notifyLater } from "./notify";

export type ActionState = { error: string | null };

const text = (form: FormData, name: string) => String(form.get(name) ?? "");
const id = (form: FormData) => Number(form.get("requirementId"));

async function attempt(work: () => Promise<void>): Promise<ActionState> {
  try {
    await work();
    return { error: null };
  } catch (error) {
    return { error: safeMessage(error) };
  }
}

async function asStakeholder(
  form: FormData,
  work: (context: { db: ReturnType<typeof getDb>; userId: number }, requirementId: number) => Promise<void>,
  notify: (db: Db, mail: MailClient, requirementId: number) => Promise<void> = notifyBriefReady,
) {
  const user = await requireRole("stakeholder");
  const requirementId = id(form);
  const result = await attempt(() => work({ db: getDb(), userId: user.id }, requirementId));
  if (!result.error) notifyLater((db, mail) => notify(db, mail, requirementId));
  revalidatePath(`/stakeholder/${requirementId}`);
  return result;
}

export async function intake(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireRole("recruiter");
  const context = { db: getDb(), userId: user.id };
  let requirementId = 0;

  const result = await attempt(async () => {
    requirementId = await createRequirement(context, {
      subject: text(form, "subject"),
      body: text(form, "body"),
      clientId: Number(form.get("clientId")),
    });
    await checkRequirement(context, requirementId);
  });

  if (requirementId && !result.error) notifyLater((db, mail) => notifyCheckReady(db, mail, requirementId));
  // If only the AI step failed, the requirement exists and can be retried from its page.
  if (requirementId) redirect(`/recruiter/${requirementId}`);
  return result;
}

export const runCheck = async (_previous: ActionState, form: FormData) =>
  asStakeholder(form, (context, requirementId) => checkRequirement(context, requirementId), notifyCheckReady);

export const send = async (_previous: ActionState, form: FormData) =>
  asStakeholder(form, (context, requirementId) =>
    sendQuestions(context, requirementId, form.getAll("question").map(String)),
  );

export const skip = async (_previous: ActionState, form: FormData) =>
  asStakeholder(form, (context, requirementId) => skipQuestions(context, requirementId, text(form, "reason")));

export const answer = async (_previous: ActionState, form: FormData) =>
  asStakeholder(form, (context, requirementId) => addClientAnswer(context, requirementId, text(form, "answer")));

export const retryBrief = async (_previous: ActionState, form: FormData) =>
  asStakeholder(form, (context, requirementId) => generateBrief(context, requirementId));

export async function toggleHindi() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  await getDb().update(users).set({ hindiToggle: !user.hindiToggle }).where(eq(users.id, user.id));
  revalidatePath("/recruiter", "layout");
}

export async function addClient(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole("admin");
  const name = text(form, "name").trim();
  const industryLabel = text(form, "industryLabel").trim();
  if (!name || !industryLabel) return { error: "Please add a client name and an industry label." };

  const db = getDb();
  const taken = (await db.select({ code: clients.code }).from(clients)).map((c) => Number(c.code.replace("CLIENT-", "")));
  const code = `CLIENT-${String(Math.max(0, ...taken) + 1).padStart(2, "0")}`;
  const aliases = text(form, "aliases").split(",").map((a) => a.trim()).filter(Boolean);

  await db.insert(clients).values({ code, name, aliases, industryLabel });
  revalidatePath("/admin/registry");
  return { error: null };
}

export async function updateAliases(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole("admin");
  const aliases = text(form, "aliases").split(",").map((a) => a.trim()).filter(Boolean);
  await getDb().update(clients).set({ aliases }).where(eq(clients.id, Number(form.get("clientId"))));
  revalidatePath("/admin/registry");
  return { error: null };
}

export async function checkInbox(): Promise<ActionState> {
  await requireRole("admin");
  const mail = gmailFromEnv();
  if (!mail) return { error: "The desk mailbox is not set up yet. See docs/gmail-setup.md." };
  const result = await attempt(async () => {
    await processInbox({ db: getDb(), mail });
  });
  revalidatePath("/admin/mailbox");
  return result;
}

export async function updateUserEmail(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole("admin");
  const email = text(form, "email").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };
  try {
    await getDb().update(users).set({ email }).where(eq(users.id, Number(form.get("userId"))));
  } catch {
    return { error: "That email is already used by another desk user." };
  }
  revalidatePath("/admin/mailbox");
  return { error: null };
}

export async function addProspect(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole("admin");
  const term = text(form, "term").trim();
  if (!term) return { error: "Please add a term." };
  await getDb().insert(prospectTerms).values({ term }).onConflictDoNothing();
  revalidatePath("/admin/registry");
  return { error: null };
}
