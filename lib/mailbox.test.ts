import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { loadSeed, readSeedFile } from "@/seed";
import { getDb, migrateDb } from "./db";
import { aiCalls, inboundEmails, requirements, submissions, users } from "./db/schema";
import { buildMime, parseGmailMessage } from "./mail/gmail";
import type { InboundMessage, MailClient, OutboundMessage } from "./mail/types";
import { processInbox, sendReminderEmails, sendToUser } from "./mailbox";
import { decideSubmission, draftSubmission, submitToStakeholder, type Flag } from "./submissions";

const DESK = "desk@example.com";
let recruiter: { id: number; email: string };
let stakeholder: { id: number; email: string };

// Stands in for Gmail, so the whole flow is tested with no account or network.
function fakeMailbox(inbox: InboundMessage[]): MailClient & { sent: OutboundMessage[] } {
  const sent: OutboundMessage[] = [];
  return {
    address: DESK,
    sent,
    listRecentIds: async () => inbox.map((m) => m.id),
    get: async (id) => inbox.find((m) => m.id === id)!,
    send: async (message) => {
      sent.push(message);
    },
  };
}

let counter = 0;
const email = (from: string, subject: string, text: string, authenticated = true): InboundMessage => ({
  id: `msg-${++counter}`,
  from,
  subject,
  text,
  authenticated,
});

const outcome = async (id: string) => (await getDb().select().from(inboundEmails).where(eq(inboundEmails.messageId, id)))[0]?.outcome;

beforeAll(async () => {
  await migrateDb();
  await loadSeed(getDb());
  const people = await getDb().select().from(users);
  recruiter = people.find((u) => u.role === "recruiter")!;
  stakeholder = people.find((u) => u.role === "stakeholder")!;
});

beforeEach(() => {
  process.env.APP_BASE_URL = "https://desk.example.com";
});

describe("email in: new requirements (section 6, Phase 4)", () => {
  it("turns a recruiter's forward into a checked requirement and tells stakeholders", async () => {
    const [subject, ...body] = readSeedFile("requirements/REQ-A.txt").split("\n");
    const message = email(recruiter.email, `Fwd: ${subject.replace("Subject: ", "")}`, body.join("\n"));
    const mail = fakeMailbox([message]);

    const result = await processInbox({ db: getDb(), mail });

    expect(result).toMatchObject({ created: 1, refused: 0 });
    const [row] = await getDb().select().from(inboundEmails).where(eq(inboundEmails.messageId, message.id));
    const [requirement] = await getDb().select().from(requirements).where(eq(requirements.id, row.requirementId!));
    expect(requirement).toMatchObject({ status: "checked", createdBy: recruiter.id });
    expect(requirement.title).toBe("Ontology Engineer - urgent need - CLIENT-01");

    const notice = mail.sent.find((m) => m.to === stakeholder.email)!;
    expect(notice.subject).toContain(`[REQ-${requirement.id}]`);
    expect(notice.text).toContain(`https://desk.example.com/stakeholder/${requirement.id}`);
    expect(notice.subject + notice.text).not.toMatch(/halvorsen|\$/i);
  });

  it("handles each email once", async () => {
    const message = email(recruiter.email, "Data Engineer req", "tarnbrook need data engineer, python, sql");
    const mail = fakeMailbox([message]);
    await processInbox({ db: getDb(), mail });
    const second = await processInbox({ db: getDb(), mail });
    expect(second.handled).toBe(0);
  });

  it.each([
    ["an unknown sender", "stranger@example.org", true, "unknown_sender"],
    ["a desk user whose email failed authentication", "", false, "not_authenticated"],
  ])("ignores %s, and sends no reply", async (_label, from, authenticated, expected) => {
    const message = email(from || recruiter.email, "Role at Halvorsen", "Halvorsen needs an engineer", authenticated);
    const mail = fakeMailbox([message]);
    const before = (await getDb().select().from(aiCalls)).length;

    await processInbox({ db: getDb(), mail });

    expect(await outcome(message.id)).toBe(expected);
    expect(mail.sent).toEqual([]);
    expect(await getDb().select().from(aiCalls)).toHaveLength(before);
  });

  it("asks the recruiter to pick the client when it is unclear", async () => {
    const message = email(recruiter.email, "Role", "A client needs a Java engineer");
    const mail = fakeMailbox([message]);
    await processInbox({ db: getDb(), mail });
    expect(await outcome(message.id)).toBe("needs_client");
    expect(mail.sent[0]).toMatchObject({ to: recruiter.email });
    expect(mail.sent[0].text).toContain("could not tell which client");
  });

  it("stops before any AI call if redaction is uncertain, and says why", async () => {
    const message = email(recruiter.email, "Role at Halvorsen", "Halvorsen role. Also ask H a l v o r s e n");
    const mail = fakeMailbox([message]);
    await processInbox({ db: getDb(), mail });
    expect(await outcome(message.id)).toBe("failed");
    expect(mail.sent[0].text).toContain("Stopped before any AI call");
  });

  it("skips the desk's own emails", async () => {
    const message = email(DESK, "[REQ-1] Requirement check ready", "...");
    const mail = fakeMailbox([message]);
    await processInbox({ db: getDb(), mail });
    expect(await outcome(message.id)).toBe("own_email");
  });
});

describe("email in: client answers", () => {
  it("adds a stakeholder's reply as the client answer, without the quoted email", async () => {
    const [subject, ...body] = readSeedFile("requirements/REQ-C.txt").split("\n");
    const forward = email(recruiter.email, subject.replace("Subject: ", ""), body.join("\n"));
    await processInbox({ db: getDb(), mail: fakeMailbox([forward]) });
    const requirementId = (await getDb().select().from(inboundEmails).where(eq(inboundEmails.messageId, forward.id)))[0].requirementId!;
    await getDb().update(requirements).set({ status: "clarifying" }).where(eq(requirements.id, requirementId));

    const reply = email(
      stakeholder.email,
      `Re: [REQ-${requirementId}] Requirement check ready`,
      "Client says remote is fine and Snowflake is the true must-have.\n\nOn Mon, Desk wrote:\n> Old text with Tarnbrook",
    );
    const mail = fakeMailbox([reply]);
    const result = await processInbox({ db: getDb(), mail });

    expect(result.answers).toBe(1);
    const [call] = await getDb().select().from(aiCalls).where(eq(aiCalls.agent, "a2_recruiter_brief")).orderBy(aiCalls.id);
    expect(call).toBeDefined();
    expect(mail.sent.some((m) => m.to === recruiter.email && m.subject.includes("brief ready"))).toBe(true);
  });

  it("does not accept a new requirement from a stakeholder", async () => {
    const message = email(stakeholder.email, "Role at Halvorsen", "Halvorsen needs an engineer");
    await processInbox({ db: getDb(), mail: fakeMailbox([message]) });
    expect(await outcome(message.id)).toBe("not_a_recruiter");
  });
});

describe("email out (G2)", () => {
  it("refuses to email anyone outside the desk's users", async () => {
    const mail = fakeMailbox([]);
    await expect(sendToUser(getDb(), mail, "client@outside.example", "Hi", "x")).rejects.toThrow("not a desk user");
    expect(mail.sent).toEqual([]);
  });

  it("sends day 3 and day 7 reminders once each", async () => {
    const [requirement] = await getDb().select().from(requirements).limit(1);
    const id = await draftSubmission({ db: getDb(), userId: recruiter.id }, {
      requirementId: requirement.id === undefined ? 0 : (await getDb().select().from(requirements).where(eq(requirements.status, "active")))[0].id,
      candidateName: "Priya Venkataraman",
      resumeText: readSeedFile("resumes/R1.txt"),
      callNotes: readSeedFile("call-notes/R1.txt"),
    });
    const flags = (await getDb().select().from(submissions).where(eq(submissions.id, id)))[0].flagsJson as Flag[];
    await submitToStakeholder({ db: getDb(), userId: recruiter.id }, id, {
      resolutions: Object.fromEntries(flags.map((f) => [f.id, { status: "Explained" as const, note: "ok" }])),
      editedSummary: "x",
    });
    await decideSubmission({ db: getDb(), userId: stakeholder.id }, id, { decision: "forward" });
    const forwardedAt = (await getDb().select().from(submissions).where(eq(submissions.id, id)))[0].forwardedAt!;
    const day = (n: number) => new Date(forwardedAt.getTime() + n * 86_400_000);

    const mail = fakeMailbox([]);
    expect(await sendReminderEmails(getDb(), mail, day(1))).toBe(0);
    expect(await sendReminderEmails(getDb(), mail, day(3))).toBe(1);
    expect(await sendReminderEmails(getDb(), mail, day(4))).toBe(0);
    expect(await sendReminderEmails(getDb(), mail, day(7))).toBe(1);
    expect(await sendReminderEmails(getDb(), mail, day(9))).toBe(0);
    expect(mail.sent.map((m) => m.subject)).toEqual(
      expect.arrayContaining(["Day 3 reminder: please log the client's reply", "Day 7 reminder: please log the client's reply"]),
    );
  });
});

describe("Gmail format", () => {
  const encode = (text: string) => Buffer.from(text).toString("base64url");
  const message = (headers: { name: string; value: string }[], parts: unknown) => ({ id: "x", payload: { headers, ...(parts as object) } });

  it("reads the sender, subject and plain text", () => {
    const parsed = parseGmailMessage(message(
      [
        { name: "From", value: "Recruiter One <Recruiter1@Example.com>" },
        { name: "Subject", value: "Fwd: Role" },
        { name: "Authentication-Results", value: "mx.google.com; dkim=pass; spf=pass; dmarc=pass (p=NONE) header.from=example.com" },
      ],
      { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: encode("Hello desk") } }, { mimeType: "text/html", body: { data: encode("<p>x</p>") } }] },
    ));
    expect(parsed).toEqual({ id: "x", from: "recruiter1@example.com", subject: "Fwd: Role", text: "Hello desk", authenticated: true });
  });

  it("treats an email without a DMARC pass as unproven", () => {
    const parsed = parseGmailMessage(message(
      [{ name: "From", value: "recruiter1@example.com" }, { name: "Authentication-Results", value: "mx.google.com; dmarc=fail" }],
      { mimeType: "text/plain", body: { data: encode("x") } },
    ));
    expect(parsed.authenticated).toBe(false);
  });

  it("falls back to HTML text", () => {
    const parsed = parseGmailMessage(message([{ name: "From", value: "a@b.c" }], { mimeType: "text/html", body: { data: encode("<p>Line one</p><p>Line two</p>") } }));
    expect(parsed.text).toBe("Line one\nLine two\n");
  });

  it("cannot be tricked into adding mail headers through the subject", () => {
    const mime = buildMime(DESK, { to: "a@example.com", subject: "Hi\r\nBcc: victim@example.org", text: "x" });
    expect(mime).not.toMatch(/^Bcc:/m);
  });
});
