import { asc, ne } from "drizzle-orm";
import type { RequirementCheck } from "./agents/a1_requirement_check";
import type { Db } from "./db";
import { briefs, errorFlags, requirementActions, requirementChecks, requirements, submissions } from "./db/schema";

// All data in a deployment counts. The pilot has its own database, so it needs no date filter.
// Everything here is a team total. Nothing is split by recruiter or candidate (G4).

export type Metrics = {
  medianMinutesToBrief: number | null;
  requirementsWithAmbiguity: number;
  requirementsChecked: number;
  sendCount: number;
  skipCount: number;
  submitted: number;
  interviews: number;
  submitToInterview: number | null;
  briefErrorsPer10: number | null;
  briefErrorCount: number;
  briefCount: number;
  forwarded: number;
  outcomesLogged: number;
  outcomeLoggedRate: number | null;
  medianMinutesToSubmit: number | null;
  byOutcome: { label: string; count: number }[];
  byRejectReason: { label: string; count: number }[];
  skippedVsClarified: { label: string; submissions: number; interviews: number }[];
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const minutesBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60_000;
const ratio = (part: number, whole: number) => (whole === 0 ? null : part / whole);

const INTERVIEW_STATUSES = ["interview", "selected"];
const OUTCOME_STATUSES = ["interview", "selected", "client_rejected"];
const OUTCOME_LABELS: [string, string[]][] = [
  ["Interview", ["interview"]],
  ["Selected", ["selected"]],
  ["Client rejected", ["client_rejected"]],
  ["No reply yet", ["no_reply"]],
  ["Waiting for an outcome", ["forwarded"]],
  ["Rejected by stakeholder", ["rejected"]],
  ["With stakeholder", ["submitted"]],
];

export async function computeMetrics(db: Db): Promise<Metrics> {
  const [requirementRows, briefRows, checkRows, actionRows, submissionRows, flagRows] = await Promise.all([
    db.select().from(requirements),
    db.select().from(briefs).orderBy(asc(briefs.version)),
    db.select().from(requirementChecks),
    db.select().from(requirementActions),
    db.select().from(submissions).where(ne(submissions.status, "draft")),
    db.select().from(errorFlags),
  ]);

  const firstBrief = new Map<number, Date>();
  for (const brief of briefRows) if (!firstBrief.has(brief.requirementId)) firstBrief.set(brief.requirementId, brief.createdAt);

  const toBrief = requirementRows.flatMap((r) => {
    const brief = firstBrief.get(r.id);
    return brief ? [minutesBetween(r.createdAt, brief)] : [];
  });

  const interviews = submissionRows.filter((s) => INTERVIEW_STATUSES.includes(s.status)).length;
  const forwarded = submissionRows.filter((s) => s.forwardedAt).length;
  const outcomesLogged = submissionRows.filter((s) => OUTCOME_STATUSES.includes(s.status)).length;
  const briefErrors = flagRows.filter((f) => f.targetType === "brief").length;

  const ambiguous = new Set(
    checkRows.filter((c) => (c.json as RequirementCheck).ambiguous_terms.length > 0).map((c) => c.requirementId),
  );

  const reasons = new Map<string, number>();
  for (const s of submissionRows) {
    const reason = s.outcomeReason ?? s.rejectReason;
    if (reason) {
      const label = reason.split(":")[0];
      reasons.set(label, (reasons.get(label) ?? 0) + 1);
    }
  }

  const skippedIds = new Set(requirementRows.filter((r) => r.sourcedOnAssumption).map((r) => r.id));
  const group = (skipped: boolean) => {
    const rows = submissionRows.filter((s) => skippedIds.has(s.requirementId) === skipped);
    return { submissions: rows.length, interviews: rows.filter((s) => INTERVIEW_STATUSES.includes(s.status)).length };
  };

  return {
    medianMinutesToBrief: median(toBrief),
    requirementsWithAmbiguity: ambiguous.size,
    requirementsChecked: new Set(checkRows.map((c) => c.requirementId)).size,
    sendCount: actionRows.filter((a) => a.action === "send" || a.action === "edit_and_send").length,
    skipCount: actionRows.filter((a) => a.action === "skip").length,
    submitted: submissionRows.length,
    interviews,
    submitToInterview: ratio(interviews, submissionRows.length),
    briefErrorsPer10: briefRows.length === 0 ? null : (briefErrors / briefRows.length) * 10,
    briefErrorCount: briefErrors,
    briefCount: briefRows.length,
    forwarded,
    outcomesLogged,
    outcomeLoggedRate: ratio(outcomesLogged, forwarded),
    medianMinutesToSubmit: median(submissionRows.flatMap((s) => (s.submittedAt ? [minutesBetween(s.createdAt, s.submittedAt)] : []))),
    byOutcome: OUTCOME_LABELS.map(([label, statuses]) => ({ label, count: submissionRows.filter((s) => statuses.includes(s.status)).length })),
    byRejectReason: [...reasons].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    skippedVsClarified: [
      { label: "Clarified", ...group(false) },
      { label: "Skipped", ...group(true) },
    ],
  };
}
