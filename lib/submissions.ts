import { createHash } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import type { RecruiterBrief } from "./agents/a2_recruiter_brief";
import { runScreeningKit } from "./agents/a3_screening_kit";
import { runSubmissionDrafter, type SubmissionDraft } from "./agents/a4_submission_drafter";
import { wrapUntrusted } from "./agents/untrusted";
import type { Db } from "./db";
import { candidates, clients, requirements, screeningKits, submissionActions, submissions } from "./db/schema";
import { loadRegistry, type LlmProvider } from "./llm";
import { redact, redactCandidateText, type Registry } from "./redaction";
import { latestBrief, WorkflowError } from "./requirements";
import { isNearDuplicate, runDeterministicChecks, type FlagType } from "./submission-checks";

// Code checks run before the model, and the application decides the order (section 11.3).

type Context = { db: Db; userId: number; provider?: LlmProvider };

export type Flag = {
  id: string;
  source: "code" | "model";
  type: FlagType | SubmissionDraft["model_flags"][number]["type"];
  detail: string;
};

export const FLAG_STATUSES = ["Explained", "Confirmed", "Unresolved"] as const;
export type FlagResolution = { status: (typeof FLAG_STATUSES)[number]; note: string };
export type FlagResolutions = Record<string, FlagResolution>;

export const REJECT_REASONS = [
  "Skills mismatch",
  "Experience level",
  "Rate",
  "Location",
  "Communication",
  "Duplicate",
  "Client paused role",
  "Other",
] as const;

// Recruiters read these, and their English comfort varies (FR-8.3).
export const REJECT_EXPLANATIONS: Record<string, string> = {
  "Skills mismatch": "The candidate's skills do not match what this role needs.",
  "Experience level": "The candidate's experience level is not right for this role.",
  Rate: "The candidate's rate does not work for this role.",
  Location: "The candidate's location does not work for this role.",
  Communication: "There was a concern about the candidate's communication.",
  Duplicate: "This candidate was already submitted.",
  "Client paused role": "The client has paused this role.",
  Other: "The stakeholder gave another reason.",
};

export type StoredDraft = { output: SubmissionDraft; model: string; generatedAt: string };

const logAction = ({ db, userId }: Context, submissionId: number, action: string, detail?: unknown) =>
  db.insert(submissionActions).values({ submissionId, userId, action, detail });

function required(result: ReturnType<typeof redact>) {
  if (!result.ok) throw new WorkflowError(`Stopped before any AI call: ${result.reason}`);
  return result.text;
}

export async function createScreeningKit(context: Context, requirementId: number): Promise<void> {
  const { db, userId, provider } = context;
  const brief = await latestBrief(db, requirementId);
  if (!brief) throw new WorkflowError("A brief is needed before a screening kit can be made.");

  const registry = await loadRegistry(db);
  const input = required(redact(wrapUntrusted("BRIEF", JSON.stringify(brief.json)), registry));
  const result = await runScreeningKit(input, { db, userId, provider, linkedRecordId: `requirement:${requirementId}` });

  await db.insert(screeningKits).values({
    briefId: brief.id,
    json: result.data,
    model: result.model,
    promptVersion: result.promptVersion,
  });
}

async function findDuplicateFlags(db: Db, maskedResume: string): Promise<Flag[]> {
  const earlier = await db
    .select({ text: candidates.maskedResumeText })
    .from(submissions)
    .innerJoin(candidates, eq(submissions.candidateId, candidates.id));

  return earlier.some((row) => isNearDuplicate(row.text, maskedResume))
    ? [{ id: "", source: "code", type: "near_duplicate", detail: "This resume is almost the same as an earlier submission in the desk." }]
    : [];
}

export async function draftSubmission(
  context: Context,
  input: { requirementId: number; candidateName: string; resumeText: string; callNotes: string },
): Promise<number> {
  const { db, userId, provider } = context;
  const candidateName = input.candidateName.trim();
  const resumeText = input.resumeText.trim();
  const callNotes = input.callNotes.trim();
  if (!candidateName || !resumeText || !callNotes) {
    throw new WorkflowError("Please add the candidate's name, the resume and the call notes.");
  }

  const brief = await latestBrief(db, input.requirementId);
  if (!brief) throw new WorkflowError("A brief is needed before a submission can be drafted.");
  const briefJson = brief.json as RecruiterBrief;

  const registry: Registry = await loadRegistry(db);

  // Code checks use the raw text. Masking would remove what they need to see.
  const codeFlags = runDeterministicChecks({ resume: resumeText, callNotes, mustHaves: briefJson.must_haves }).map(
    (flag): Flag => ({ id: "", source: "code", ...flag }),
  );

  const maskedResume = required(redactCandidateText(resumeText, candidateName, registry));
  const callNotesRedacted = required(redactCandidateText(callNotes, candidateName, registry));

  const modelInput = required(
    redact(
      [
        wrapUntrusted("RESUME", maskedResume),
        wrapUntrusted("CALL_NOTES", callNotesRedacted),
        wrapUntrusted("BRIEF", JSON.stringify({ must_haves: briefJson.must_haves, nice_to_haves: briefJson.nice_to_haves })),
      ].join("\n\n"),
      registry,
    ),
  );

  const duplicateFlags = await findDuplicateFlags(db, maskedResume);

  // Nothing is saved until the draft succeeds, so a failure leaves no half-made record.
  const draft = await runSubmissionDrafter(modelInput, { db, userId, provider, linkedRecordId: `requirement:${input.requirementId}` });

  const flags: Flag[] = [
    ...codeFlags,
    ...duplicateFlags,
    ...draft.data.model_flags.map((flag): Flag => ({ id: "", source: "model", ...flag })),
  ].map((flag, index) => ({ ...flag, id: `flag-${index + 1}` }));

  const [candidate] = await db
    .insert(candidates)
    .values({
      displayName: candidateName,
      maskedResumeText: maskedResume,
      resumeHash: createHash("sha256").update(resumeText).digest("hex"),
      createdBy: userId,
    })
    .returning({ id: candidates.id });

  const stored: StoredDraft = { output: draft.data, model: draft.model, generatedAt: draft.generatedAt.toISOString() };
  const [submission] = await db
    .insert(submissions)
    .values({
      requirementId: input.requirementId,
      candidateId: candidate.id,
      recruiterId: userId,
      callNotes,
      callNotesRedacted,
      draftJson: stored,
      flagsJson: flags,
      flagResolutionsJson: {},
    })
    .returning({ id: submissions.id });

  await logAction(context, submission.id, "drafted");
  return submission.id;
}

async function loadSubmission(db: Db, id: number) {
  const [row] = await db.select().from(submissions).where(eq(submissions.id, id));
  if (!row) throw new WorkflowError("Submission not found.");
  return row;
}

export function unmarkedFlags(flags: Flag[], resolutions: FlagResolutions): Flag[] {
  return flags.filter((flag) => {
    const resolution = resolutions[flag.id];
    return !resolution || !FLAG_STATUSES.includes(resolution.status) || !resolution.note.trim();
  });
}

const blocksOnUnresolved = () => process.env.UNRESOLVED_FLAG_POLICY === "block";

export async function submitToStakeholder(
  context: Context,
  submissionId: number,
  input: { resolutions: FlagResolutions; editedSummary: string },
): Promise<void> {
  const { db, userId } = context;
  const submission = await loadSubmission(db, submissionId);
  if (submission.recruiterId !== userId) throw new WorkflowError("Only the recruiter on this submission can submit it.");
  if (submission.status !== "draft") throw new WorkflowError("This submission has already been sent.");

  const flags = submission.flagsJson as Flag[];
  if (unmarkedFlags(flags, input.resolutions).length > 0) {
    throw new WorkflowError("Please mark every flag and add a short note.");
  }
  if (blocksOnUnresolved() && flags.some((flag) => input.resolutions[flag.id].status === "Unresolved")) {
    throw new WorkflowError("Unresolved flags cannot be submitted under the current policy.");
  }

  const draftSummary = (submission.draftJson as StoredDraft).output.summary_5_lines;
  const editedLines = input.editedSummary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  await db
    .update(submissions)
    .set({
      flagResolutionsJson: input.resolutions,
      editedSummary: editedLines.join("\n"),
      status: "submitted",
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, submissionId));

  // Kept so that prompts can be improved from what recruiters change (FR-7.3).
  await logAction(context, submissionId, "submitted", {
    summary_lines_removed: draftSummary.filter((line) => !editedLines.includes(line)),
    summary_lines_added: editedLines.filter((line) => !draftSummary.includes(line)),
  });
}

export async function decideSubmission(
  context: Context,
  submissionId: number,
  input: { decision: "forward" | "reject"; reason?: string; note?: string },
): Promise<void> {
  const { db } = context;
  const submission = await loadSubmission(db, submissionId);
  if (submission.status !== "submitted") throw new WorkflowError("This submission has already been decided.");

  if (input.decision === "forward") {
    await db
      .update(submissions)
      .set({ status: "forwarded", stakeholderDecision: "forwarded", forwardedAt: new Date(), updatedAt: new Date() })
      .where(eq(submissions.id, submissionId));
    await logAction(context, submissionId, "forwarded");
    return;
  }

  const reason = input.reason ?? "";
  const note = input.note?.trim() ?? "";
  if (!(REJECT_REASONS as readonly string[]).includes(reason)) throw new WorkflowError("Please choose a reason.");
  if (reason === "Other" && !note) throw new WorkflowError("Please add a note for the reason Other.");

  await db
    .update(submissions)
    .set({
      status: "rejected",
      stakeholderDecision: "rejected",
      rejectReason: note ? `${reason}: ${note}` : reason,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, submissionId));
  await logAction(context, submissionId, "rejected", { reason, note });
}

export const CLIENT_OUTCOMES = {
  interview: "Interview",
  client_rejected: "Rejected",
  selected: "Selected",
  no_reply: "No reply yet",
} as const;
export type ClientOutcome = keyof typeof CLIENT_OUTCOMES;

/** One click for the stakeholder, so that outcomes actually get logged (FR-9.1). */
export async function logOutcome(
  context: Context,
  submissionId: number,
  input: { outcome: ClientOutcome; reason?: string; note?: string },
): Promise<void> {
  const { db } = context;
  const submission = await loadSubmission(db, submissionId);
  if (!["forwarded", "no_reply", "interview"].includes(submission.status)) {
    throw new WorkflowError("An outcome can be logged only after a submission is forwarded.");
  }
  if (!(input.outcome in CLIENT_OUTCOMES)) throw new WorkflowError("Please choose an outcome.");
  if (submission.status === "interview" && input.outcome === "no_reply") {
    throw new WorkflowError("This submission already has an interview logged.");
  }

  const now = new Date();
  if (input.outcome === "no_reply") {
    // Not a client outcome. It records that someone checked, and quiets the reminder.
    await db.update(submissions).set({ status: "no_reply", noReplyAt: now, updatedAt: now }).where(eq(submissions.id, submissionId));
    await logAction(context, submissionId, "no_reply");
    return;
  }

  const note = input.note?.trim() ?? "";
  const reason = input.outcome === "client_rejected" ? (input.reason ?? "") : "";
  if (input.outcome === "client_rejected") {
    if (!(REJECT_REASONS as readonly string[]).includes(reason)) throw new WorkflowError("Please choose a reason.");
    if (reason === "Other" && !note) throw new WorkflowError("Please add a note for the reason Other.");
  }

  await db
    .update(submissions)
    .set({
      status: input.outcome,
      clientOutcome: CLIENT_OUTCOMES[input.outcome],
      outcomeReason: reason ? (note ? `${reason}: ${note}` : reason) : null,
      outcomeAt: now,
      updatedAt: now,
    })
    .where(eq(submissions.id, submissionId));
  await logAction(context, submissionId, `outcome_${input.outcome}`, { reason, note });
}

const DAY_MS = 86_400_000;

function reminderStage(from: Date, at: Date): 0 | 3 | 7 {
  const days = (at.getTime() - from.getTime()) / DAY_MS;
  return days >= 7 ? 7 : days >= 3 ? 3 : 0;
}

/**
 * Day 3 and day 7 reminders (FR-9.2). "No reply yet" quiets the current stage,
 * so a check on day 4 stays quiet until day 7. Worked out on page load, so no job is needed.
 */
export function reminderDay(submission: { forwardedAt: Date | null; noReplyAt: Date | null; status: string }, now = new Date()): 3 | 7 | null {
  if (!submission.forwardedAt || !["forwarded", "no_reply"].includes(submission.status)) return null;
  const stage = reminderStage(submission.forwardedAt, now);
  const checked = submission.noReplyAt ? reminderStage(submission.forwardedAt, submission.noReplyAt) : 0;
  return stage > checked ? (stage as 3 | 7) : null;
}

export const restoreCandidate = (text: string, name: string) => text.replaceAll("[CANDIDATE]", name);

/** Plain text for pasting into Conrep. Rates are left out on purpose. */
export function conrepText(input: {
  candidateName: string;
  requirementTitle: string;
  summaryLines: string[];
  evidence: SubmissionDraft["evidence_per_must_have"];
  flags: Flag[];
  resolutions: FlagResolutions;
  client: { code: string; name: string };
}): string {
  const { candidateName, requirementTitle, summaryLines, evidence, flags, resolutions, client } = input;
  const lines = [
    `Candidate: ${candidateName}`,
    `Requirement: ${requirementTitle.replaceAll(client.code, client.name)}`,
    "",
    "Summary:",
    ...summaryLines.map((line) => restoreCandidate(line, candidateName)),
    "",
    "Evidence:",
    ...evidence.map((item) => `- ${item.must_have}: ${item.evidence} (${item.source})`),
  ];
  if (flags.length > 0) {
    lines.push("", "Checks:", ...flags.map((flag) => `- ${flag.detail} ${resolutions[flag.id]?.status}: ${resolutions[flag.id]?.note}`));
  }
  return lines.join("\n");
}

export type SubmissionRow = Awaited<ReturnType<typeof listSubmissions>>[number];

export function listSubmissions(db: Db, filter: { requirementId?: number; recruiterId?: number; statuses?: (typeof submissions.$inferSelect.status)[] }) {
  const condition = filter.requirementId !== undefined
    ? eq(submissions.requirementId, filter.requirementId)
    : filter.recruiterId !== undefined
      ? eq(submissions.recruiterId, filter.recruiterId)
      : filter.statuses
        ? inArray(submissions.status, filter.statuses)
        : undefined;

  return db
    .select({
      id: submissions.id,
      status: submissions.status,
      rejectReason: submissions.rejectReason,
      clientOutcome: submissions.clientOutcome,
      outcomeReason: submissions.outcomeReason,
      forwardedAt: submissions.forwardedAt,
      noReplyAt: submissions.noReplyAt,
      candidateName: candidates.displayName,
      requirementTitle: requirements.title,
      clientCode: clients.code,
    })
    .from(submissions)
    .innerJoin(candidates, eq(submissions.candidateId, candidates.id))
    .innerJoin(requirements, eq(submissions.requirementId, requirements.id))
    .innerJoin(clients, eq(requirements.clientId, clients.id))
    .where(condition)
    .orderBy(desc(submissions.id));
}
