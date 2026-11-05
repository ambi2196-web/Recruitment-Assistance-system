import { beforeAll, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/digest/route";
import { loadSeed, readSeedFile } from "@/seed";
import { loadSeedOutcomes } from "@/seed/outcomes";
import { runWeeklyDigest } from "./agents/a5_weekly_digest";
import { buildDigestTable, generateDigest, latestDigest } from "./digest";
import { getDb, migrateDb } from "./db";
import { aiCalls, briefs, clients, errorFlags, screeningKits, submissionActions, submissions, users, weeklyDigests } from "./db/schema";
import { flagWrongLine, markPromptFixed } from "./error-log";
import { LlmOutputError, type LlmProvider } from "./llm";
import { computeMetrics } from "./metrics";
import { redact } from "./redaction";
import { checkRequirement, createRequirement, skipQuestions, WorkflowError } from "./requirements";
import { createScreeningKit, decideSubmission, draftSubmission, logOutcome, reminderDay, submitToStakeholder, type Flag } from "./submissions";

let recruiterId: number;
let otherRecruiterId: number;
let stakeholderId: number;
let requirementId: number;

const recruiter = () => ({ db: getDb(), userId: recruiterId });
const stakeholder = () => ({ db: getDb(), userId: stakeholderId });
const load = async (id: number) => (await getDb().select().from(submissions).where(eq(submissions.id, id)))[0];

// Walks the real workflow, because a full cycle is what Phase 3 has to prove.
async function forwardedSubmission() {
  const id = await draftSubmission(recruiter(), {
    requirementId,
    candidateName: "Priya Venkataraman",
    resumeText: readSeedFile("resumes/R1.txt"),
    callNotes: readSeedFile("call-notes/R1.txt"),
  });
  const flags = (await load(id)).flagsJson as Flag[];
  const resolutions = Object.fromEntries(flags.map((f) => [f.id, { status: "Explained" as const, note: "Checked." }]));
  await submitToStakeholder(recruiter(), id, { resolutions, editedSummary: "Summary" });
  await decideSubmission(stakeholder(), id, { decision: "forward" });
  return id;
}

beforeAll(async () => {
  await migrateDb();
  await loadSeed(getDb());
  const people = await getDb().select().from(users);
  const recruiters = people.filter((u) => u.role === "recruiter");
  recruiterId = recruiters[0].id;
  otherRecruiterId = recruiters[1].id;
  stakeholderId = people.find((u) => u.role === "stakeholder")!.id;

  const [client] = await getDb().select().from(clients).where(eq(clients.code, "CLIENT-03"));
  requirementId = await createRequirement(recruiter(), { subject: "Data Engineer req", body: "python, sql, snowflake", clientId: client.id });
  await checkRequirement(recruiter(), requirementId);
  await skipQuestions(stakeholder(), requirementId, "Urgent");
});

describe("outcome log (M9)", () => {
  it("logs Interview in one step, and records who did it", async () => {
    const id = await forwardedSubmission();
    await logOutcome(stakeholder(), id, { outcome: "interview" });
    expect(await load(id)).toMatchObject({ status: "interview", clientOutcome: "Interview" });
    const log = await getDb().select().from(submissionActions).where(eq(submissionActions.submissionId, id)).orderBy(desc(submissionActions.id));
    expect(log[0]).toMatchObject({ action: "outcome_interview", userId: stakeholderId });
  });

  it("logs a client rejection with a reason", async () => {
    const id = await forwardedSubmission();
    await logOutcome(stakeholder(), id, { outcome: "client_rejected", reason: "Rate" });
    expect(await load(id)).toMatchObject({ status: "client_rejected", outcomeReason: "Rate" });
  });

  it("needs a listed reason, and a note for Other", async () => {
    const id = await forwardedSubmission();
    await expect(logOutcome(stakeholder(), id, { outcome: "client_rejected", reason: "Vibes" })).rejects.toThrow("choose a reason");
    await expect(logOutcome(stakeholder(), id, { outcome: "client_rejected", reason: "Other" })).rejects.toThrow("note");
  });

  it("moves from no reply to interview to selected", async () => {
    const id = await forwardedSubmission();
    await logOutcome(stakeholder(), id, { outcome: "no_reply" });
    expect((await load(id)).clientOutcome).toBeNull();
    await logOutcome(stakeholder(), id, { outcome: "interview" });
    await logOutcome(stakeholder(), id, { outcome: "selected" });
    expect((await load(id)).status).toBe("selected");
  });

  it("will not step back from an interview to no reply", async () => {
    const id = await forwardedSubmission();
    await logOutcome(stakeholder(), id, { outcome: "interview" });
    await expect(logOutcome(stakeholder(), id, { outcome: "no_reply" })).rejects.toThrow(WorkflowError);
  });

  it("refuses an outcome before forwarding", async () => {
    const id = await draftSubmission(recruiter(), { requirementId, candidateName: "Test Person", resumeText: "A, Jan 2020 - Present", callNotes: "Notes" });
    await expect(logOutcome(stakeholder(), id, { outcome: "interview" })).rejects.toThrow("after a submission is forwarded");
  });
});

describe("reminders (FR-9.2)", () => {
  const forwardedAt = new Date("2026-11-01T00:00:00Z");
  const day = (n: number) => new Date(forwardedAt.getTime() + n * 86_400_000);
  const pending = { forwardedAt, noReplyAt: null, status: "forwarded" };

  it("is quiet before day 3", () => {
    expect(reminderDay(pending, day(2.9))).toBeNull();
  });

  it("fires at day 3 and day 7", () => {
    expect(reminderDay(pending, day(3))).toBe(3);
    expect(reminderDay(pending, day(6.9))).toBe(3);
    expect(reminderDay(pending, day(7))).toBe(7);
  });

  it("goes quiet after No reply yet, until the next stage", () => {
    const checked = { forwardedAt, noReplyAt: day(4), status: "no_reply" };
    expect(reminderDay(checked, day(5))).toBeNull();
    expect(reminderDay(checked, day(7))).toBe(7);
  });

  it("stays quiet once No reply yet was logged after day 7", () => {
    expect(reminderDay({ forwardedAt, noReplyAt: day(8), status: "no_reply" }, day(30))).toBeNull();
  });

  it("stops once an outcome is logged", () => {
    expect(reminderDay({ ...pending, status: "interview" }, day(10))).toBeNull();
  });
});

describe("error log (M10)", () => {
  const firstBrief = async () => (await getDb().select().from(briefs).where(eq(briefs.requirementId, requirementId)))[0];

  it("records a wrong line, with its agent and requirement", async () => {
    const brief = await firstBrief();
    await flagWrongLine(recruiter(), { target: "brief", targetId: brief.id, lineRef: "Snowflake", note: "Not needed." });
    const [flag] = await getDb().select().from(errorFlags).orderBy(desc(errorFlags.id)).limit(1);
    expect(flag).toMatchObject({ agent: "a2_recruiter_brief", requirementId, lineRef: "Snowflake", note: "Not needed.", reportedBy: recruiterId, status: "open" });
  });

  it("covers kit lines too", async () => {
    await createScreeningKit(recruiter(), requirementId);
    const [kit] = await getDb().select().from(screeningKits).limit(1);
    await flagWrongLine(recruiter(), { target: "kit", targetId: kit.id, lineRef: "Question 1", note: "" });
    const [flag] = await getDb().select().from(errorFlags).orderBy(desc(errorFlags.id)).limit(1);
    expect(flag).toMatchObject({ agent: "a3_screening_kit", requirementId, note: null });
  });

  it("is limited to the assigned recruiter", async () => {
    const brief = await firstBrief();
    await expect(
      flagWrongLine({ db: getDb(), userId: otherRecruiterId }, { target: "brief", targetId: brief.id, lineRef: "x", note: "y" }),
    ).rejects.toThrow("assigned recruiter");
  });

  it("marks a prompt as fixed with a commit link", async () => {
    const [flag] = await getDb().select().from(errorFlags).limit(1);
    await expect(markPromptFixed(getDb(), flag.id, "abc123")).rejects.toThrow("link");
    await expect(markPromptFixed(getDb(), flag.id, "javascript:alert(1)")).rejects.toThrow("link");
    await markPromptFixed(getDb(), flag.id, "https://github.com/example/repo/commit/abc123");
    const [updated] = await getDb().select().from(errorFlags).where(eq(errorFlags.id, flag.id));
    expect(updated).toMatchObject({ status: "prompt_fixed", fixedCommit: "https://github.com/example/repo/commit/abc123" });
  });
});

describe("metrics (M12)", () => {
  it("counts a full cycle correctly", async () => {
    const before = await computeMetrics(getDb());

    const id = await forwardedSubmission();
    const mid = await computeMetrics(getDb());
    expect(mid.submitted).toBe(before.submitted + 1);
    expect(mid.forwarded).toBe(before.forwarded + 1);
    expect(mid.outcomesLogged).toBe(before.outcomesLogged);

    await logOutcome(stakeholder(), id, { outcome: "interview" });
    const after = await computeMetrics(getDb());
    expect(after.interviews).toBe(before.interviews + 1);
    expect(after.outcomesLogged).toBe(before.outcomesLogged + 1);
    expect(after.submitToInterview).toBeCloseTo(after.interviews / after.submitted);
  });

  it("does not count No reply yet as an outcome", async () => {
    const before = await computeMetrics(getDb());
    await logOutcome(stakeholder(), await forwardedSubmission(), { outcome: "no_reply" });
    expect((await computeMetrics(getDb())).outcomesLogged).toBe(before.outcomesLogged);
  });

  it("works out the brief error rate per 10 briefs", async () => {
    const m = await computeMetrics(getDb());
    expect(m.briefCount).toBeGreaterThan(0);
    expect(m.briefErrorsPer10).toBeCloseTo((m.briefErrorCount / m.briefCount) * 10);
  });

  it("counts SKIP decisions and first-brief time", async () => {
    const m = await computeMetrics(getDb());
    expect(m.skipCount).toBeGreaterThan(0);
    expect(m.medianMinutesToBrief).toBeGreaterThanOrEqual(0);
  });

  it("has no per-person field (G4)", async () => {
    expect(JSON.stringify(await computeMetrics(getDb()))).not.toMatch(/recruiter|candidate/i);
  });
});

// Phase 3 "done when": digest generates from seed outcomes.
describe("weekly digest (M11)", () => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  beforeAll(async () => {
    await loadSeedOutcomes(getDb(), now);
  });

  it("does not load seed outcomes twice", async () => {
    const count = (await getDb().select().from(submissions)).length;
    await loadSeedOutcomes(getDb(), now);
    expect(await getDb().select().from(submissions)).toHaveLength(count);
  });

  it("builds the table per client code", async () => {
    const table = await buildDigestTable(getDb(), weekAgo, new Date(now.getTime() + 1000));
    const first = table.find((row) => row.client_code === "CLIENT-01")!;
    expect(first).toMatchObject({
      submissions: 4,
      interviews: 2,
      rejections_by_reason: { "Skills mismatch": 2 },
      skipped_submissions: 2,
      skipped_interviews: 0,
      clarified_submissions: 2,
      clarified_interviews: 2,
    });
  });

  it("generates, and sends only aggregated data to the model", async () => {
    await generateDigest({ db: getDb() });
    const digest = await latestDigest(getDb());
    expect(digest!.observations.length).toBeGreaterThan(0);
    expect(digest!.observations.length).toBeLessThanOrEqual(5);

    const [call] = await getDb().select().from(aiCalls).where(eq(aiCalls.agent, "a5_weekly_digest"));
    expect(call.redactedInput).toContain("<<<AGGREGATED_TABLE");
    expect(call.redactedInput).toContain("CLIENT-01");
    expect(call.redactedInput).not.toMatch(/Seed Candidate|Priya|candidate_/);
  });

  it("drops free-text notes from reasons", async () => {
    const id = await forwardedSubmission();
    await logOutcome(stakeholder(), id, { outcome: "client_rejected", reason: "Other", note: "Mr Jones disliked Priya" });
    const table = await buildDigestTable(getDb(), weekAgo, new Date(Date.now() + 1000));
    expect(JSON.stringify(table)).not.toMatch(/jones|priya/i);
    expect(JSON.stringify(table)).toContain('"Other"');
  });

  describe("scheduled route (FR-11.3)", () => {
    const call = (authorization?: string) =>
      GET(new NextRequest("http://localhost/api/digest", { headers: authorization ? { authorization } : {} }));

    it("stays closed when no secret is set", async () => {
      vi.stubEnv("CRON_SECRET", "");
      expect((await call("Bearer ")).status).toBe(401);
    });

    it("refuses a wrong secret and runs with the right one", async () => {
      vi.stubEnv("CRON_SECRET", "test-secret");
      expect((await call("Bearer wrong")).status).toBe(401);
      expect((await call()).status).toBe(401);

      const before = (await getDb().select().from(weeklyDigests)).length;
      const response = await call("Bearer test-secret");
      expect(await response.json()).toEqual({ ok: true });
      expect(await getDb().select().from(weeklyDigests)).toHaveLength(before + 1);
    });
  });

  it("refuses an empty week", async () => {
    await expect(generateDigest({ db: getDb() }, new Date("2020-01-01T00:00:00Z"))).rejects.toThrow("no submissions");
  });

  it("rejects more than 5 observations", async () => {
    const input = redact("Hello", { clients: [{ code: "CLIENT-01", name: "Acme", aliases: [] }], prospectTerms: [] });
    if (!input.ok) throw new Error(input.reason);
    const provider: LlmProvider = {
      name: "fake",
      complete: vi.fn().mockResolvedValue({ text: JSON.stringify({ observations: ["a", "b", "c", "d", "e", "f"] }), inputTokens: 1, outputTokens: 1 }),
    };
    await expect(runWeeklyDigest(input.text, { db: getDb(), provider })).rejects.toThrow(LlmOutputError);
  });
});
