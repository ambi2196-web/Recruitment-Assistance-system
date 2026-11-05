import { asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { candidates, clients, requirements, submissions, users } from "@/lib/db/schema";

// Fictional history, so the digest and metrics have something to show in a demo (section 12, Phase 3).

const DAY_MS = 86_400_000;
const SUBMIT_MINUTES = 12;

type Row = {
  clientCode: string;
  skipped: boolean;
  status: "interview" | "selected" | "client_rejected" | "rejected" | "forwarded" | "no_reply" | "submitted";
  reason?: string;
  daysAgo: number;
};

const ROWS: Row[] = [
  { clientCode: "CLIENT-01", skipped: false, status: "interview", daysAgo: 6 },
  { clientCode: "CLIENT-01", skipped: false, status: "selected", daysAgo: 6 },
  { clientCode: "CLIENT-01", skipped: true, status: "client_rejected", reason: "Skills mismatch", daysAgo: 5 },
  { clientCode: "CLIENT-01", skipped: true, status: "client_rejected", reason: "Skills mismatch", daysAgo: 5 },
  { clientCode: "CLIENT-02", skipped: false, status: "interview", daysAgo: 5 },
  { clientCode: "CLIENT-02", skipped: false, status: "rejected", reason: "Rate", daysAgo: 4 },
  { clientCode: "CLIENT-02", skipped: true, status: "client_rejected", reason: "Experience level", daysAgo: 4 },
  { clientCode: "CLIENT-03", skipped: true, status: "forwarded", daysAgo: 4 },
  { clientCode: "CLIENT-03", skipped: false, status: "no_reply", daysAgo: 6 },
  { clientCode: "CLIENT-03", skipped: false, status: "interview", daysAgo: 3 },
];

const MARKER = "Seed Candidate";

export async function loadSeedOutcomes(db: Db, now = new Date()): Promise<void> {
  const already = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.displayName, `${MARKER} 1`));
  if (already.length > 0) return;

  // Ordered, because an edited row can move and "first" would then mean someone else.
  const people = await db.select().from(users).orderBy(asc(users.id));
  const recruiter = people.find((u) => u.role === "recruiter")!;
  const clientRows = await db.select().from(clients);

  for (const [index, row] of ROWS.entries()) {
    const number = index + 1;
    const client = clientRows.find((c) => c.code === row.clientCode)!;
    const at = new Date(now.getTime() - row.daysAgo * DAY_MS);
    const reachedClient = row.status !== "rejected" && row.status !== "submitted";
    const hasOutcome = ["interview", "selected", "client_rejected"].includes(row.status);

    const text = `Seed role ${number} for ${row.clientCode}.`;
    const [requirement] = await db
      .insert(requirements)
      .values({
        clientId: client.id,
        title: `Seed role ${number}`,
        originalText: text,
        redactedText: text,
        status: "active",
        sourcedOnAssumption: row.skipped,
        skipReason: row.skipped ? "Urgent" : null,
        createdBy: recruiter.id,
        assignedRecruiterId: recruiter.id,
        createdAt: at,
      })
      .returning({ id: requirements.id });

    const [candidate] = await db
      .insert(candidates)
      .values({ displayName: `${MARKER} ${number}`, maskedResumeText: "Seed resume.", resumeHash: `seed-${number}`, createdBy: recruiter.id })
      .returning({ id: candidates.id });

    await db.insert(submissions).values({
      requirementId: requirement.id,
      candidateId: candidate.id,
      recruiterId: recruiter.id,
      draftJson: {
        model: "seed",
        generatedAt: at.toISOString(),
        output: {
          summary_5_lines: ["Seed summary line.", "Seed summary line 2.", "Seed summary line 3.", "Seed summary line 4.", "Seed summary line 5."],
          evidence_per_must_have: [],
          model_flags: [],
          questions_to_clarify_with_candidate: [],
        },
      },
      flagsJson: [],
      flagResolutionsJson: {},
      status: row.status,
      rejectReason: row.status === "rejected" ? row.reason : null,
      clientOutcome: hasOutcome ? row.status : null,
      outcomeReason: row.status === "client_rejected" ? row.reason : null,
      submittedAt: new Date(at.getTime() + SUBMIT_MINUTES * 60_000),
      forwardedAt: reachedClient ? at : null,
      outcomeAt: hasOutcome ? now : null,
      createdAt: at,
    });
  }
}
