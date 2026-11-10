import type { RequirementCheck } from "./agents/a1_requirement_check";
import { hasBooleanSyntax, type RecruiterBrief } from "./agents/a2_recruiter_brief";

// Scores A1 and A2 on the golden set (section 13). Code does what it can check.
// What needs judgement, such as whether a name was invented, is listed for a human.

export type GoldenCase = {
  id: string;
  industry: string;
  text: string;
  what_client_wanted: string;
  expected_ambiguous_terms: string[];
};

export type CaseResult = {
  id: string;
  error?: string;
  ambiguity?: "yes" | "partly" | "no" | "none expected";
  missedTerms?: string[];
  namesToCheck?: string[];
  averageSentenceWords?: number;
  screenCharacters?: number;
  fitsOneScreen?: boolean;
  booleanFilters?: number;
};

export type Summary = {
  cases: number;
  errors: number;
  ambiguityYes: number;
  ambiguityPartly: number;
  ambiguityNo: number;
  namesToCheck: number;
  averageSentenceWords: number;
  notFittingOneScreen: number;
  booleanFilters: number;
};

const sameTerm = (a: string, b: string) => {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x.includes(y) || y.includes(x);
};

function sentences(texts: string[]): string[] {
  return texts.flatMap((text) => text.split(/(?<=[.!?])\s+/)).map((s) => s.trim()).filter(Boolean);
}

export function averageWords(texts: string[]): number {
  const list = sentences(texts);
  if (list.length === 0) return 0;
  return list.reduce((total, sentence) => total + sentence.split(/\s+/).length, 0) / list.length;
}

// About what fits the three-column brief at 1366x768. Confirm the outliers in a browser.
const SCREEN_CHARACTER_BUDGET = 1800;

function briefText(brief: RecruiterBrief): string[] {
  const f = brief.linkedin_recruiter_filters;
  return [
    ...brief.project_story,
    ...brief.must_haves,
    ...brief.nice_to_haves,
    ...brief.tech_lineage.flatMap((t) => [t.named_in_requirement, t.plain_explanation, ...t.current_or_related_names]),
    ...brief.adjacent_job_titles,
    ...brief.target_companies.flatMap((c) => [c.name, c.why]),
    ...f.job_titles, ...f.skills, ...f.locations, f.years_of_experience, ...f.industries, ...f.companies_to_include,
    ...brief.open_questions,
  ];
}

export function scoreCase(golden: GoldenCase, check: RequirementCheck, brief: RecruiterBrief): CaseResult {
  const found = check.ambiguous_terms.map((t) => t.term);
  const missedTerms = golden.expected_ambiguous_terms.filter((expected) => !found.some((term) => sameTerm(term, expected)));
  const expectedCount = golden.expected_ambiguous_terms.length;
  const ambiguity =
    expectedCount === 0 ? "none expected" : missedTerms.length === 0 ? "yes" : missedTerms.length < expectedCount ? "partly" : "no";

  // Names in the output that the requirement never mentioned. Some are fair
  // (a modern product name), some may be invented. A human decides.
  const input = golden.text.toLowerCase();
  const f = brief.linkedin_recruiter_filters;
  const names = [
    ...brief.tech_lineage.flatMap((t) => t.current_or_related_names),
    ...brief.target_companies.map((c) => c.name),
    ...f.companies_to_include,
    ...f.skills,
  ];
  const namesToCheck = [...new Set(names.filter((name) => !input.includes(name.toLowerCase())))];

  const filterValues = [...f.job_titles, ...f.skills, ...f.locations, f.years_of_experience, ...f.industries, ...f.companies_to_include];
  const screenCharacters = briefText(brief).join(" ").length;

  return {
    id: golden.id,
    ambiguity,
    missedTerms,
    namesToCheck,
    averageSentenceWords: averageWords([...check.summary, ...check.client_questions, ...brief.project_story, ...brief.tech_lineage.map((t) => t.plain_explanation)]),
    screenCharacters,
    fitsOneScreen: screenCharacters <= SCREEN_CHARACTER_BUDGET,
    booleanFilters: filterValues.filter(hasBooleanSyntax).length,
  };
}

export function summarise(results: CaseResult[]): Summary {
  const scored = results.filter((r) => !r.error);
  const words = scored.map((r) => r.averageSentenceWords ?? 0);
  return {
    cases: results.length,
    errors: results.length - scored.length,
    ambiguityYes: scored.filter((r) => r.ambiguity === "yes").length,
    ambiguityPartly: scored.filter((r) => r.ambiguity === "partly").length,
    ambiguityNo: scored.filter((r) => r.ambiguity === "no").length,
    namesToCheck: scored.reduce((total, r) => total + (r.namesToCheck?.length ?? 0), 0),
    averageSentenceWords: words.length ? Number((words.reduce((a, b) => a + b, 0) / words.length).toFixed(1)) : 0,
    notFittingOneScreen: scored.filter((r) => !r.fitsOneScreen).length,
    booleanFilters: scored.reduce((total, r) => total + (r.booleanFilters ?? 0), 0),
  };
}

/** Lists where this run is worse than the last one. Section 13: never ship a worse prompt. */
export function worseThan(previous: Summary, current: Summary): string[] {
  const worse: string[] = [];
  if (current.errors > previous.errors) worse.push("More cases failed to run");
  if (current.ambiguityYes < previous.ambiguityYes) worse.push("Fewer ambiguities fully caught");
  if (current.ambiguityNo > previous.ambiguityNo) worse.push("More ambiguities missed");
  if (current.namesToCheck > previous.namesToCheck) worse.push("More unfamiliar names to check");
  if (current.averageSentenceWords > Math.max(previous.averageSentenceWords, 20)) worse.push("Sentences got longer");
  if (current.notFittingOneScreen > previous.notFittingOneScreen) worse.push("More briefs too long for one screen");
  if (current.booleanFilters > previous.booleanFilters) worse.push("Boolean syntax in filters");
  return worse;
}

const SUMMARY_MARK = "eval-summary";

export function readSummary(report: string): Summary | null {
  const json = report.match(new RegExp(`<!-- ${SUMMARY_MARK} (\\{.*\\}) -->`))?.[1];
  return json ? (JSON.parse(json) as Summary) : null;
}

export function renderReport(input: {
  set: string;
  date: Date;
  provider: string;
  model: string;
  promptVersions: string[];
  results: CaseResult[];
  summary: Summary;
  worse: string[] | null;
  costUsd: number;
}): string {
  const { set, date, provider, model, promptVersions, results, summary, worse, costUsd } = input;
  const lines = [
    `# Evaluation report: ${set}`,
    "",
    `Date: ${date.toISOString()}  `,
    `Model: ${provider}/${model}  `,
    `Prompts: ${promptVersions.join(", ")}  `,
    `Estimated cost: $${costUsd.toFixed(4)}`,
    "",
    "## Result",
    "",
    worse === null ? "First run for this set, so there is nothing to compare with." : worse.length === 0 ? "**Not worse than the last run.**" : `**Worse than the last run:** ${worse.join("; ")}. Do not ship this prompt version.`,
    "",
    "| Check | Result |",
    "|---|---|",
    `| Cases | ${summary.cases} (${summary.errors} failed to run) |`,
    `| Ambiguity caught | yes ${summary.ambiguityYes}, partly ${summary.ambiguityPartly}, no ${summary.ambiguityNo} |`,
    `| Unfamiliar names to check by hand | ${summary.namesToCheck} |`,
    `| Average sentence length | ${summary.averageSentenceWords} words (target under 20) |`,
    `| Briefs likely too long for one screen | ${summary.notFittingOneScreen} |`,
    `| Boolean syntax in filters | ${summary.booleanFilters} |`,
    "",
    "## Cases",
    "",
    "| Case | Ambiguity | Missed | Names to check | Avg words | Fits screen |",
    "|---|---|---|---|---|---|",
    ...results.map((r) =>
      r.error
        ? `| ${r.id} | Failed: ${r.error} | | | | |`
        : `| ${r.id} | ${r.ambiguity} | ${r.missedTerms?.join(", ") || "-"} | ${r.namesToCheck?.join(", ") || "-"} | ${r.averageSentenceWords?.toFixed(1)} | ${r.fitsOneScreen ? "yes" : `no (${r.screenCharacters} chars)`} |`,
    ),
    "",
    "Names to check: decide for each whether it is a fair related name or an invention. Record invented ones in the error log.",
    "",
    `<!-- ${SUMMARY_MARK} ${JSON.stringify(summary)} -->`,
    "",
  ];
  return lines.join("\n");
}
