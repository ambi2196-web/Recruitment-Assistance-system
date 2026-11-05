import { z } from "zod";
import { callAgent, type AgentCall, type AgentResult } from "../llm";
import type { RedactedText } from "../redaction";

const LIVED_EXPERIENCE = /\b(decision|decided|chose|choose|trade-?offs?|fail(ed|ure)?|went wrong|mistake|hardest|incident|why did you|would you change)\b/i;

/** A simple check that a question asks about experience, not a definition (FR-5.2). */
export const probesLivedExperience = (question: string) => LIVED_EXPERIENCE.test(question);

const schema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        good_answer_signals: z.array(z.string()).min(1),
        red_flags: z.array(z.string()).min(1),
        follow_up: z.string().min(1),
      }),
    )
    .length(5)
    .refine((questions) => questions.filter((q) => probesLivedExperience(q.question)).length >= 2, "Too few depth questions"),
  identity_checks: z.array(z.string()).min(3),
});

export type ScreeningKit = z.infer<typeof schema>;

type Options = Pick<AgentCall<ScreeningKit>, "userId" | "linkedRecordId" | "db" | "provider">;

export function runScreeningKit(input: RedactedText, options: Options = {}): Promise<AgentResult<ScreeningKit>> {
  return callAgent({ agent: "a3_screening_kit", prompt: "a3_screening_kit.v1", schema, input, ...options });
}
