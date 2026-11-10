import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { Db } from "./db";
import { clients, inboundEmails, requirements, submissions, users } from "./db/schema";
import { loadRegistry, type LlmProvider } from "./llm";
import type { MailClient } from "./mail/types";
import { redact } from "./redaction";
import { addClientAnswer, checkRequirement, createRequirement, safeMessage, WorkflowError } from "./requirements";
import { reminderDay } from "./submissions";

// "Email in, email out" (section 6). The desk only ever emails people in its own
// user list, so nothing can reach a client or a candidate (G2, section 7).

const appUrl = (path: string) => `${(process.env.APP_BASE_URL ?? "").replace(/\/$/, "")}${path}`;

/** Every outgoing email passes through here, and only to known desk users. */
export async function sendToUser(db: Db, mail: MailClient, to: string, subject: string, text: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.email, to.toLowerCase()));
  if (!user) throw new Error("Refusing to email an address that is not a desk user.");
  await mail.send({ to: user.email, subject, text: `${text}\n\nOpen the desk: ${appUrl("/")}\n\nThis email was sent by the Requirement Desk.` });
}

// A failed notification must never undo the human decision that triggered it.
async function sendQuietly(db: Db, mail: MailClient, to: string, subject: string, text: string) {
  try {
    await sendToUser(db, mail, to, subject, text);
  } catch (error) {
    console.error("Desk email not sent:", error instanceof Error ? error.message : error);
  }
}

async function emailsFor(db: Db, role: "stakeholder" | "recruiter" | "admin") {
  return (await db.select({ email: users.email }).from(users).where(eq(users.role, role))).map((u) => u.email);
}

const tag = (requirementId: number) => `[REQ-${requirementId}]`;

// Notifications carry a redacted title and a link. Details stay inside the desk.
export async function notifyCheckReady(db: Db, mail: MailClient, requirementId: number) {
  const [row] = await db.select({ title: requirements.title }).from(requirements).where(eq(requirements.id, requirementId));
  for (const to of await emailsFor(db, "stakeholder")) {
    await sendQuietly(db, mail, to, `${tag(requirementId)} Requirement check ready: ${row.title}`,
      `A requirement check is ready for your decision: SEND, EDIT or SKIP.\n${appUrl(`/stakeholder/${requirementId}`)}\n\nWhen the client answers, reply to this email with their answer. Keep ${tag(requirementId)} in the subject.`);
  }
}

export async function notifyBriefReady(db: Db, mail: MailClient, requirementId: number) {
  const [row] = await db
    .select({ title: requirements.title, email: users.email })
    .from(requirements)
    .innerJoin(users, eq(requirements.assignedRecruiterId, users.id))
    .where(eq(requirements.id, requirementId));
  if (row) await sendQuietly(db, mail, row.email, `${tag(requirementId)} Recruiter brief ready: ${row.title}`, `Your recruiter brief is ready.\n${appUrl(`/recruiter/${requirementId}`)}`);
}

export async function notifySubmissionWaiting(db: Db, mail: MailClient, submissionId: number) {
  for (const to of await emailsFor(db, "stakeholder")) {
    await sendQuietly(db, mail, to, "A submission is waiting for your decision", `A recruiter has approved a submission.\n${appUrl(`/stakeholder/submissions/${submissionId}`)}`);
  }
}

export async function notifyRecruiterOfSubmission(db: Db, mail: MailClient, submissionId: number, what: string) {
  const [row] = await db
    .select({ email: users.email })
    .from(submissions)
    .innerJoin(users, eq(submissions.recruiterId, users.id))
    .where(eq(submissions.id, submissionId));
  if (row) await sendQuietly(db, mail, row.email, `Update on your submission: ${what}`, `${what}\n${appUrl(`/recruiter/submissions/${submissionId}`)}`);
}

/** Day 3 and day 7 reminder emails (FR-9.2, Phase 4). Each day is sent once. */
export async function sendReminderEmails(db: Db, mail: MailClient, now = new Date()): Promise<number> {
  const pending = await db
    .select()
    .from(submissions)
    .where(and(inArray(submissions.status, ["forwarded", "no_reply"]), or(isNull(submissions.reminderEmailedDay), lt(submissions.reminderEmailedDay, 7))));

  let sent = 0;
  for (const submission of pending) {
    const day = reminderDay(submission, now);
    if (!day || (submission.reminderEmailedDay ?? 0) >= day) continue;
    for (const to of await emailsFor(db, "stakeholder")) {
      await sendQuietly(db, mail, to, `Day ${day} reminder: please log the client's reply`,
        `A forwarded submission has no client outcome logged.\n${appUrl(`/stakeholder/submissions/${submission.id}`)}`);
    }
    await db.update(submissions).set({ reminderEmailedDay: day }).where(eq(submissions.id, submission.id));
    sent += 1;
  }
  return sent;
}

const stripSubjectPrefix = (subject: string) => subject.replace(/^\s*((fwd?|fw|re)\s*:\s*)+/i, "").trim();

// Keeps only what the stakeholder wrote, not the quoted email below it.
function newReplyText(text: string): string {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^On .+wrote:\s*$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim())) break;
    if (!line.trim().startsWith(">")) lines.push(line);
  }
  return lines.join("\n").trim();
}

/** Picks the client by name. Anything other than exactly one match goes back to a human. */
async function detectClient(db: Db, text: string): Promise<number | null> {
  const registry = await loadRegistry(db);
  const rows = await db.select({ id: clients.id, code: clients.code }).from(clients);
  const result = redact(text, registry);
  if (!result.ok) throw new WorkflowError(`Stopped before any AI call: ${result.reason}`);
  const codes = new Set(result.text.match(/\bCLIENT-\d+\b/g) ?? []);
  if (codes.size !== 1) return null;
  return rows.find((r) => codes.has(r.code))?.id ?? null;
}

export type InboxResult = { handled: number; created: number; answers: number; refused: number };

export async function processInbox(context: { db: Db; mail: MailClient; provider?: LlmProvider }): Promise<InboxResult> {
  const { db, mail, provider } = context;
  const result: InboxResult = { handled: 0, created: 0, answers: 0, refused: 0 };

  const seen = new Set((await db.select({ id: inboundEmails.messageId }).from(inboundEmails)).map((r) => r.id));

  for (const id of await mail.listRecentIds()) {
    if (seen.has(id)) continue;
    const message = await mail.get(id);
    result.handled += 1;

    const record = (outcome: string, detail?: string, requirementId?: number) =>
      db.insert(inboundEmails).values({ messageId: id, fromAddress: message.from, subject: message.subject.slice(0, 200), outcome, detail, requirementId }).onConflictDoNothing();

    // The desk's own notifications land in its inbox too. Skip them quietly.
    if (message.from === mail.address) {
      await record("own_email");
      continue;
    }

    const [sender] = await db.select().from(users).where(eq(users.email, message.from));
    if (!sender || !message.authenticated) {
      // Unknown or unproven senders get no reply, so the desk cannot be used to send spam.
      await record(sender ? "not_authenticated" : "unknown_sender");
      result.refused += 1;
      continue;
    }

    const context = { db, userId: sender.id, provider };
    const answerTo = Number(message.subject.match(/\[REQ-(\d+)\]/)?.[1]);

    try {
      if (answerTo && sender.role === "stakeholder") {
        await addClientAnswer(context, answerTo, newReplyText(message.text));
        await record("client_answer", undefined, answerTo);
        await notifyBriefReady(db, mail, answerTo);
        result.answers += 1;
        continue;
      }

      if (sender.role !== "recruiter") {
        await record("not_a_recruiter");
        await sendQuietly(db, mail, sender.email, `Not processed: ${message.subject}`,
          "Only recruiters can forward new requirements to the desk. To add a client answer, reply to the desk's requirement check email and keep the [REQ-n] tag in the subject.");
        result.refused += 1;
        continue;
      }

      const clientId = await detectClient(db, `${message.subject}\n${message.text}`);
      if (!clientId) {
        await record("needs_client");
        await sendQuietly(db, mail, sender.email, `Please add this requirement in the desk: ${message.subject}`,
          "The desk could not tell which client this email is for. Please paste it into the desk and choose the client.");
        result.refused += 1;
        continue;
      }

      const requirementId = await createRequirement(context, { subject: stripSubjectPrefix(message.subject), body: message.text, clientId });
      await record("requirement_created", undefined, requirementId);
      await checkRequirement(context, requirementId);
      await notifyCheckReady(db, mail, requirementId);
      result.created += 1;
    } catch (error) {
      const reason = safeMessage(error);
      await record("failed", reason);
      await sendQuietly(db, mail, sender.email, `Not processed: ${message.subject}`, `${reason}\nPlease paste it into the desk instead.`);
      result.refused += 1;
    }
  }

  return result;
}
