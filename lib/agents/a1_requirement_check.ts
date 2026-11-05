import { z } from "zod";
import { callAgent, type AgentCall, type AgentResult } from "../llm";
import type { RedactedText } from "../redaction";

const wordCount = (text: string) => text.trim().split(/\s+/).length;

const schema = z.object({
  summary: z.array(z.string().min(1)).length(3),
  role_family: z.string().min(1),
  must_haves: z.array(z.string()),
  nice_to_haves: z.array(z.string()),
  missing_info: z.array(z.object({ item: z.string().min(1), why_it_matters: z.string().min(1) })),
  ambiguous_terms: z.array(
    z
      .object({
        term: z.string().min(1),
        possible_meanings: z.array(z.string()).min(2),
        profile_each_implies: z.array(z.string()),
      })
      // The UI pairs these by position, so a length mismatch would mislead.
      .refine((t) => t.possible_meanings.length === t.profile_each_implies.length),
  ),
  client_questions: z
    .array(z.string().min(1).refine((q) => wordCount(q) <= 25, "Too long for a client question"))
    .length(3),
  confidence: z.enum(["high", "medium", "low"]),
  confidence_reason: z.string().min(1),
});

export type RequirementCheck = z.infer<typeof schema>;

type Options = Pick<AgentCall<RequirementCheck>, "userId" | "linkedRecordId" | "db" | "provider">;

export function runRequirementCheck(input: RedactedText, options: Options = {}): Promise<AgentResult<RequirementCheck>> {
  return callAgent({ agent: "a1_requirement_check", prompt: "a1_requirement_check.v1", schema, input, ...options });
}
