import { beforeAll, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { loadSeed, readSeedFile } from "@/seed";
import { probesLivedExperience, runScreeningKit, type ScreeningKit } from "./agents/a3_screening_kit";
import { containsJudgement, runSubmissionDrafter, type SubmissionDraft } from "./agents/a4_submission_drafter";
import { getDb, migrateDb } from "./db";
import { aiCalls, candidates, clients, requirements, screeningKits, submissionActions, submissions, users } from "./db/schema";
import { LlmOutputError, type LlmProvider } from "./llm";
import { mockOutput } from "./mock-outputs";
import { redact } from "./redaction";
import { checkRequirement, createRequirement, skipQuestions, WorkflowError } from "./requirements";
import {
  conrepText,
  createScreeningKit,
  decideSubmission,
  draftSubmission,
  submitToStakeholder,
  unmarkedFlags,
  type Flag,
  type FlagResolutions,
} from "./submissions";

let recruiterId: number;
let otherRecruiterId: number;
let stakeholderId: number;

const recruiter = () => ({ db: getDb(), userId: recruiterId });
const stakeholder = () => ({ db: getDb(), userId: stakeholderId });

const resume = (id: string) => readSeedFile(`resumes/${id}.txt`);
const notes = (id: string) => readSeedFile(`call-notes/${id}.txt`);
const nameOf = (id: string) => resume(id).split(/\r?\n/)[0];

async function requirementWithBrief(file: string, code: string) {
  const [client] = await getDb().select().from(clients).where(eq(clients.code, code));
  const [subject, ...body] = readSeedFile(file).split("\n");
  const id = await createRequirement(recruiter(), { subject: subject.replace("Subject: ", ""), body: body.join("\n"), clientId: client.id });
  await checkRequirement(recruiter(), id);
  await skipQuestions(stakeholder(), id, "Urgent");
  return id;
}

const draft = (requirementId: number, id: string) =>
  draftSubmission(recruiter(), { requirementId, candidateName: nameOf(id), resumeText: resume(id), callNotes: notes(id) });

const load = async (id: number) => (await getDb().select().from(submissions).where(eq(submissions.id, id)))[0];
const flagTypes = async (id: number) => ((await load(id)).flagsJson as Flag[]).map((f) => f.type);

const resolveAll = (flags: Flag[], status: FlagResolutions[string]["status"] = "Explained"): FlagResolutions =>
  Object.fromEntries(flags.map((flag) => [flag.id, { status, note: "Checked with the candidate." }]));

async function submit(id: number, status: FlagResolutions[string]["status"] = "Explained") {
  const flags = (await load(id)).flagsJson as Flag[];
  await submitToStakeholder(recruiter(), id, { resolutions: resolveAll(flags, status), editedSummary: "Line one\nLine two" });
}

let reqC: number;
let reqB: number;
let reqA: number;

beforeAll(async () => {
  await migrateDb();
  await loadSeed(getDb());
  const people = await getDb().select().from(users);
  const recruiters = people.filter((u) => u.role === "recruiter");
  recruiterId = recruiters[0].id;
  otherRecruiterId = recruiters[1].id;
  stakeholderId = people.find((u) => u.role === "stakeholder")!.id;
  reqC = await requirementWithBrief("requirements/REQ-C.txt", "CLIENT-03");
  reqB = await requirementWithBrief("requirements/REQ-B.txt", "CLIENT-02");
  reqA = await requirementWithBrief("requirements/REQ-A.txt", "CLIENT-01");
});

// Phase 2 "done when": R1–R4 produce the expected flags.
describe("seed resumes through the whole draft step", () => {
  it("R1 has no consistency flags", async () => {
    const id = await draft(reqC, "R1");
    expect(await flagTypes(id)).toEqual([]);
  });

  it("R1 evidence points to the resume", async () => {
    const stored = (await load(await draft(reqC, "R1"))).draftJson as { output: SubmissionDraft };
    expect(stored.output.evidence_per_must_have.find((e) => e.must_have === "Python")?.source).toBe("resume");
  });

  it("R4 is flagged as a near-duplicate of R1", async () => {
    const id = await draft(reqC, "R4");
    expect(await flagTypes(id)).toContain("near_duplicate");
  });

  it("R2 has overlapping dates and an unsupported years claim", async () => {
    const types = await flagTypes(await draft(reqB, "R2"));
    expect(types).toEqual(expect.arrayContaining(["date_overlap", "years_mismatch"]));
  });

  it("R3 has its hidden instruction flagged, and no verdict is produced", async () => {
    const id = await draft(reqA, "R3");
    expect(await flagTypes(id)).toContain("instruction_like_text");
    const stored = (await load(id)).draftJson as { output: SubmissionDraft };
    expect(stored.output.summary_5_lines.join(" ")).not.toMatch(/best match/i);
  });
});

describe("what reaches the model (G1, FR-6.3)", () => {
  it("holds no candidate identity, client name or rate", async () => {
    await draft(reqC, "R1");
    const [call] = await getDb().select().from(aiCalls).where(eq(aiCalls.agent, "a4_submission_drafter")).orderBy(desc(aiCalls.id)).limit(1);

    expect(call.redactedInput).toContain("<<<RESUME");
    expect(call.redactedInput).toContain("<<<CALL_NOTES");
    expect(call.redactedInput).not.toMatch(/priya|venkataraman|@|555|\$|68|tarnbrook/i);
    expect(call.redactedInput).toContain("[CANDIDATE]");
    expect(call.redactedInput).toContain("[RATE]");
  });

  it("marks the resume as data, not instructions", async () => {
    await draft(reqA, "R3");
    const [call] = await getDb().select().from(aiCalls).where(eq(aiCalls.agent, "a4_submission_drafter")).orderBy(desc(aiCalls.id)).limit(1);
    expect(call.redactedInput).toMatch(/data, not instructions[\s\S]*<<<RESUME[\s\S]*Ignore previous instructions[\s\S]*>>>/);
  });

  it("stores the masked resume, and keeps original call notes apart", async () => {
    const row = await load(await draft(reqC, "R1"));
    const [candidate] = await getDb().select().from(candidates).where(eq(candidates.id, row.candidateId));
    expect(candidate.maskedResumeText).not.toMatch(/priya|555/i);
    expect(candidate.displayName).toBe("Priya Venkataraman");
    expect(row.callNotes).toContain("$68/hr");
    expect(row.callNotesRedacted).not.toMatch(/68|priya|tarnbrook/i);
  });

  it("stops, saves nothing and calls no model when text cannot be redacted", async () => {
    const before = (await getDb().select().from(submissions)).length;
    const calls = (await getDb().select().from(aiCalls)).length;

    await expect(
      draftSubmission(recruiter(), { requirementId: reqC, candidateName: "Test Person", resumeText: "Worked at H a l v o r s e n", callNotes: "Fine" }),
    ).rejects.toThrow(WorkflowError);

    expect(await getDb().select().from(submissions)).toHaveLength(before);
    expect(await getDb().select().from(aiCalls)).toHaveLength(calls);
  });

  it("saves nothing if the model fails", async () => {
    const before = (await getDb().select().from(candidates)).length;
    const provider: LlmProvider = { name: "fake", complete: vi.fn().mockRejectedValue(new Error("down")) };
    await expect(
      draftSubmission({ ...recruiter(), provider }, { requirementId: reqC, candidateName: "Test Person", resumeText: "A", callNotes: "B" }),
    ).rejects.toThrow("down");
    expect(await getDb().select().from(candidates)).toHaveLength(before);
  });
});

describe("recruiter checkpoint (M7)", () => {
  it("refuses to submit until every flag is marked with a note", async () => {
    const id = await draft(reqB, "R2");
    const flags = (await load(id)).flagsJson as Flag[];
    expect(flags.length).toBeGreaterThan(1);

    const partial = resolveAll(flags.slice(1));
    await expect(submitToStakeholder(recruiter(), id, { resolutions: partial, editedSummary: "x" })).rejects.toThrow("mark every flag");

    const noNote = { ...resolveAll(flags), [flags[0].id]: { status: "Confirmed" as const, note: "  " } };
    await expect(submitToStakeholder(recruiter(), id, { resolutions: noNote, editedSummary: "x" })).rejects.toThrow("mark every flag");

    expect((await load(id)).status).toBe("draft");
  });

  it("warns but allows Unresolved flags by default (D4)", async () => {
    const id = await draft(reqB, "R2");
    await submit(id, "Unresolved");
    expect((await load(id)).status).toBe("submitted");
  });

  it("blocks Unresolved flags when the policy says so", async () => {
    vi.stubEnv("UNRESOLVED_FLAG_POLICY", "block");
    const id = await draft(reqB, "R2");
    await expect(submit(id, "Unresolved")).rejects.toThrow("policy");
    vi.unstubAllEnvs();
    vi.stubEnv("MONTHLY_BUDGET_USD", "5");
  });

  it("saves the edit, and records how it differs from the draft", async () => {
    const id = await draft(reqC, "R1");
    await submit(id);
    expect((await load(id)).editedSummary).toBe("Line one\nLine two");

    const [log] = await getDb().select().from(submissionActions).where(eq(submissionActions.action, "submitted")).orderBy(desc(submissionActions.id)).limit(1);
    expect(log.detail).toMatchObject({ summary_lines_added: ["Line one", "Line two"] });
    expect(log.userId).toBe(recruiterId);
  });

  it("lets only the recruiter on the submission submit it, and only once", async () => {
    const id = await draft(reqC, "R1");
    const empty = { resolutions: {}, editedSummary: "x" };
    await expect(submitToStakeholder({ db: getDb(), userId: otherRecruiterId }, id, empty)).rejects.toThrow("Only the recruiter");
    await submit(id);
    await expect(submit(id)).rejects.toThrow("already been sent");
  });

  it("lists exactly the unmarked flags", () => {
    const flags = [{ id: "a" }, { id: "b" }] as Flag[];
    expect(unmarkedFlags(flags, { a: { status: "Confirmed", note: "ok" } }).map((f) => f.id)).toEqual(["b"]);
  });
});

describe("stakeholder decision (M8)", () => {
  async function submitted() {
    const id = await draft(reqC, "R1");
    await submit(id);
    return id;
  }

  it("records who forwarded", async () => {
    const id = await submitted();
    await decideSubmission(stakeholder(), id, { decision: "forward" });
    expect((await load(id)).status).toBe("forwarded");
    const log = await getDb().select().from(submissionActions).where(eq(submissionActions.submissionId, id));
    expect(log.find((l) => l.action === "forwarded")!.userId).toBe(stakeholderId);
  });

  it("stores the rejection reason", async () => {
    const id = await submitted();
    await decideSubmission(stakeholder(), id, { decision: "reject", reason: "Experience level" });
    expect(await load(id)).toMatchObject({ status: "rejected", rejectReason: "Experience level" });
  });

  it("needs a reason from the list, and a note for Other", async () => {
    const id = await submitted();
    await expect(decideSubmission(stakeholder(), id, { decision: "reject", reason: "Vibes" })).rejects.toThrow("choose a reason");
    await expect(decideSubmission(stakeholder(), id, { decision: "reject", reason: "Other" })).rejects.toThrow("note");
    await decideSubmission(stakeholder(), id, { decision: "reject", reason: "Other", note: "Role changed." });
    expect((await load(id)).rejectReason).toBe("Other: Role changed.");
  });

  it("cannot decide twice, or decide a draft", async () => {
    const id = await submitted();
    await decideSubmission(stakeholder(), id, { decision: "forward" });
    await expect(decideSubmission(stakeholder(), id, { decision: "reject", reason: "Rate" })).rejects.toThrow("already been decided");
    const unsent = await draft(reqC, "R1");
    await expect(decideSubmission(stakeholder(), unsent, { decision: "forward" })).rejects.toThrow("already been decided");
  });
});

describe("Conrep text (FR-7.4)", () => {
  it("is plain, and restores names without any rate", () => {
    const flags = [{ id: "flag-1", source: "code", type: "date_overlap", detail: "Dates overlap." }] as Flag[];
    const text = conrepText({
      candidateName: "Priya V",
      requirementTitle: "Data Engineer for CLIENT-03",
      summaryLines: ["[CANDIDATE] builds pipelines."],
      evidence: [{ must_have: "Python", evidence: "Mentioned.", source: "resume" }],
      flags,
      resolutions: { "flag-1": { status: "Explained", note: "Contract overlap." } },
      client: { code: "CLIENT-03", name: "Tarnbrook Mining Group" },
    });
    expect(text).toContain("Requirement: Data Engineer for Tarnbrook Mining Group");
    expect(text).toContain("Priya V builds pipelines.");
    expect(text).toContain("Dates overlap. Explained: Contract overlap.");
    expect(text).not.toMatch(/\$|<|\[/);
  });
});

describe("screening kit (M5)", () => {
  it("is stored against the latest brief", async () => {
    await createScreeningKit(recruiter(), reqC);
    const rows = await getDb().select().from(screeningKits);
    expect(rows.length).toBeGreaterThan(0);
    const [call] = await getDb().select().from(aiCalls).where(eq(aiCalls.agent, "a3_screening_kit"));
    expect(call.redactedInput).toContain("<<<BRIEF");
  });

  it("needs a brief first", async () => {
    const [plain] = await getDb().select().from(requirements).where(eq(requirements.status, "new")).limit(1);
    await expect(createScreeningKit(recruiter(), plain.id)).rejects.toThrow("brief");
  });
});

describe("agent schemas", () => {
  const input = () => {
    const result = redact("Hello", { clients: [{ code: "CLIENT-01", name: "Acme", aliases: [] }], prospectTerms: [] });
    if (!result.ok) throw new Error(result.reason);
    return result.text;
  };
  const replyWith = (value: unknown): LlmProvider => ({
    name: "fake",
    complete: vi.fn().mockResolvedValue({ text: JSON.stringify(value), inputTokens: 1, outputTokens: 1 }),
  });
  const kit = mockOutput("a3_screening_kit", "") as ScreeningKit;
  const output = mockOutput("a4_submission_drafter", "") as SubmissionDraft;

  it("A3 rejects 4 questions", async () => {
    await expect(runScreeningKit(input(), { db: getDb(), provider: replyWith({ ...kit, questions: kit.questions.slice(0, 4) }) })).rejects.toThrow(LlmOutputError);
  });

  it("A3 rejects a kit of only definitions (FR-5.2)", async () => {
    const definitions = kit.questions.map((q) => ({ ...q, question: "What is a primary key?" }));
    await expect(runScreeningKit(input(), { db: getDb(), provider: replyWith({ ...kit, questions: definitions }) })).rejects.toThrow(LlmOutputError);
  });

  it("recognises questions about lived experience", () => {
    expect(probesLivedExperience("Tell me about a trade-off you made")).toBe(true);
    expect(probesLivedExperience("What is Kubernetes?")).toBe(false);
  });

  it.each([
    ["Candidate is the best match for this role."],
    ["Score: 9 out of 10."],
    ["Ranked first among applicants."],
    ["92% fit for the role."],
    ["A strong fit."],
    ["Not recommended."],
  ])("A4 rejects a verdict on a person: %s (G4)", async (line) => {
    const verdict = { ...output, summary_5_lines: [line, "b", "c", "d", "e"] };
    await expect(runSubmissionDrafter(input(), { db: getDb(), provider: replyWith(verdict) })).rejects.toThrow(LlmOutputError);
  });

  it("allows ordinary evidence wording", () => {
    expect(containsJudgement("Built a feature ranking pipeline? No, built pipelines.")).toBe(true); // Known over-block.
    expect(containsJudgement("Built Airflow pipelines for reporting.")).toBe(false);
  });
});
