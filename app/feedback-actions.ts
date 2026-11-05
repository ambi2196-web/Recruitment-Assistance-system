"use server";

import { revalidatePath } from "next/cache";
import { generateDigest } from "@/lib/digest";
import { getDb } from "@/lib/db";
import { flagWrongLine, markPromptFixed, type WrongTarget } from "@/lib/error-log";
import { safeMessage } from "@/lib/requirements";
import { requireRole } from "@/lib/session";
import { logOutcome, type ClientOutcome } from "@/lib/submissions";
import type { ActionState } from "./requirement-actions";

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

async function attempt(work: () => Promise<void>): Promise<ActionState> {
  try {
    await work();
    return { error: null };
  } catch (error) {
    return { error: safeMessage(error) };
  }
}

export async function recordOutcome(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireRole("stakeholder");
  const submissionId = Number(form.get("submissionId"));
  const result = await attempt(() =>
    logOutcome({ db: getDb(), userId: user.id }, submissionId, {
      outcome: text(form, "outcome") as ClientOutcome,
      reason: text(form, "reason"),
      note: text(form, "note"),
    }),
  );
  revalidatePath(`/stakeholder/submissions/${submissionId}`);
  return result;
}

export async function reportWrongLine(input: { target: WrongTarget; targetId: number; lineRef: string; note: string }): Promise<ActionState> {
  const user = await requireRole("recruiter");
  return attempt(() => flagWrongLine({ db: getDb(), userId: user.id }, input));
}

export async function fixPrompt(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole("admin");
  const result = await attempt(() => markPromptFixed(getDb(), Number(form.get("flagId")), text(form, "commit")));
  revalidatePath("/admin/errors");
  return result;
}

export async function runDigest(): Promise<ActionState> {
  const user = await requireRole("admin");
  const result = await attempt(() => generateDigest({ db: getDb(), userId: user.id }));
  revalidatePath("/admin/digest");
  return result;
}
