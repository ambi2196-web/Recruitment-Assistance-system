import type { RecruiterBrief } from "./agents/a2_recruiter_brief";

export type ChangeSection = { label: string; added: string[]; removed: string[] };

function compare(label: string, before: string[], after: string[]): ChangeSection | null {
  const added = after.filter((item) => !before.includes(item));
  const removed = before.filter((item) => !after.includes(item));
  return added.length || removed.length ? { label, added, removed } : null;
}

// Worked out by code, not the model, so "What changed" can always be trusted (FR-4.3).
export function diffBriefs(before: RecruiterBrief, after: RecruiterBrief): ChangeSection[] {
  const a = before.linkedin_recruiter_filters;
  const b = after.linkedin_recruiter_filters;

  return [
    compare("Must-haves", before.must_haves, after.must_haves),
    compare("Job title filters", a.job_titles, b.job_titles),
    compare("Skill filters", a.skills, b.skills),
    compare("Location filters", a.locations, b.locations),
    compare("Years of experience", [a.years_of_experience], [b.years_of_experience]),
    compare("Industry filters", a.industries, b.industries),
    compare("Company filters", a.companies_to_include, b.companies_to_include),
    compare("Open questions", before.open_questions, after.open_questions),
  ].filter((section) => section !== null);
}
