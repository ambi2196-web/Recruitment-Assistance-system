import { z } from "zod";
import { callAgent, type AgentCall, type AgentResult } from "../llm";
import type { RedactedText } from "../redaction";

// G8: code enforces this, because a prompt alone cannot guarantee it.
export function hasBooleanSyntax(text: string): boolean {
  return /\b(AND|OR|NOT)\b/.test(text) || /["“”]/.test(text) || /[()]/.test(text);
}

const filterValue = z.string().min(1).refine((v) => !hasBooleanSyntax(v), "Boolean syntax in a LinkedIn filter");
const filterList = z.array(filterValue);

const schema = z.object({
  project_story: z.array(z.string().min(1)).length(3),
  must_haves: z.array(z.string()),
  nice_to_haves: z.array(z.string()),
  tech_lineage: z.array(
    z.object({
      named_in_requirement: z.string().min(1),
      current_or_related_names: z.array(z.string()),
      plain_explanation: z.string().min(1),
    }),
  ),
  adjacent_job_titles: z.array(z.string()),
  linkedin_recruiter_filters: z.object({
    job_titles: filterList,
    skills: filterList,
    locations: filterList,
    years_of_experience: filterValue,
    industries: filterList,
    companies_to_include: filterList,
  }),
  target_companies: z.array(z.object({ name: z.string().min(1), why: z.string().min(1) })),
  open_questions: z.array(z.string()),
  hindi_lines: z.object({ project_story: z.string().optional() }).optional(),
  confidence: z.enum(["high", "medium", "low"]),
});

export type RecruiterBrief = z.infer<typeof schema>;

type Options = Pick<AgentCall<RecruiterBrief>, "userId" | "linkedRecordId" | "db" | "provider">;

export function runRecruiterBrief(input: RedactedText, options: Options = {}): Promise<AgentResult<RecruiterBrief>> {
  return callAgent({ agent: "a2_recruiter_brief", prompt: "a2_recruiter_brief.v1", schema, input, ...options });
}
