"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { safeMessage } from "@/lib/requirements";
import { requireRole } from "@/lib/session";
import { createScreeningKit, decideSubmission, draftSubmission, FLAG_STATUSES, submitToStakeholder, type FlagResolutions } from "@/lib/submissions";
import { notifyRecruiterOfSubmission, notifySubmissionWaiting } from "@/lib/mailbox";
import { readResumeFile } from "@/lib/resume-files";
import { notifyLater } from "./notify";
import type { ActionState } from "./requirement-actions";

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function makeKit(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireRole("recruiter");
  const requirementId = Number(form.get("requirementId"));
  try {
    await createScreeningKit({ db: getDb(), userId: user.id }, requirementId);
  } catch (error) {
    return { error: safeMessage(error) };
  }
  revalidatePath(`/recruiter/${requirementId}/kit`);
  return { error: null };
}

export async function draft(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireRole("recruiter");
  let submissionId = 0;
  try {
    // A file wins over pasted text, so a recruiter cannot submit two different resumes at once.
    const file = form.get("resumeFile");
    const parsed =
      file instanceof File && file.size > 0
        ? await readResumeFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
        : { text: text(form, "resumeText"), flags: [] };

    submissionId = await draftSubmission(
      { db: getDb(), userId: user.id },
      {
        requirementId: Number(form.get("requirementId")),
        candidateName: text(form, "candidateName"),
        resumeText: parsed.text,
        callNotes: text(form, "callNotes"),
        fileFlags: parsed.flags,
      },
    );
  } catch (error) {
    return { error: safeMessage(error) };
  }
  redirect(`/recruiter/submissions/${submissionId}`);
}

export async function submit(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireRole("recruiter");
  const submissionId = Number(form.get("submissionId"));

  const resolutions: FlagResolutions = {};
  for (const flagId of form.getAll("flagId").map(String)) {
    const status = text(form, `status-${flagId}`) as FlagResolutions[string]["status"];
    resolutions[flagId] = { status: FLAG_STATUSES.includes(status) ? status : ("" as never), note: text(form, `note-${flagId}`) };
  }

  try {
    await submitToStakeholder({ db: getDb(), userId: user.id }, submissionId, { resolutions, editedSummary: text(form, "summary") });
  } catch (error) {
    return { error: safeMessage(error) };
  }
  notifyLater((db, mail) => notifySubmissionWaiting(db, mail, submissionId));
  revalidatePath(`/recruiter/submissions/${submissionId}`);
  return { error: null };
}

export async function decide(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireRole("stakeholder");
  const submissionId = Number(form.get("submissionId"));
  const reason = text(form, "reason");

  try {
    await decideSubmission(
      { db: getDb(), userId: user.id },
      submissionId,
      reason ? { decision: "reject", reason, note: text(form, "note") } : { decision: "forward" },
    );
  } catch (error) {
    return { error: safeMessage(error) };
  }
  const what = reason ? "The stakeholder rejected it." : "The stakeholder forwarded it to the client.";
  notifyLater((db, mail) => notifyRecruiterOfSubmission(db, mail, submissionId, what));
  revalidatePath(`/stakeholder/submissions/${submissionId}`);
  return { error: null };
}
