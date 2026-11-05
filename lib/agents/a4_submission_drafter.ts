import { z } from "zod";
import { callAgent, type AgentCall, type AgentResult } from "../llm";
import type { RedactedText } from "../redaction";

const JUDGEMENT = /\b(scor(e|es|ed|ing)|rank(s|ed|ing)?|best (match|candidate|fit)|top candidate|perfect (fit|match)|(strong|good|great|poor|weak) (fit|match)|(not )?recommended|\d+\s*%\s*(fit|match))\b/i;

// G4 and G3: a poisoned resume could steer a model towards a verdict.
// Code stops that wording here, whatever the prompt said.
export const containsJudgement = (text: string) => JUDGEMENT.test(text);

const noJudgement = z.string().min(1).refine((text) => !containsJudgement(text), "Judgement of a person");

const schema = z.object({
  summary_5_lines: z.array(noJudgement).length(5),
  evidence_per_must_have: z.array(
    z.object({ must_have: z.string().min(1), evidence: noJudgement, source: z.enum(["resume", "call", "missing"]) }),
  ),
  model_flags: z.array(z.object({ type: z.enum(["unclear_claim", "inconsistency", "missing_evidence"]), detail: z.string().min(1) })),
  questions_to_clarify_with_candidate: z.array(z.string()),
});

export type SubmissionDraft = z.infer<typeof schema>;

type Options = Pick<AgentCall<SubmissionDraft>, "userId" | "linkedRecordId" | "db" | "provider">;

export function runSubmissionDrafter(input: RedactedText, options: Options = {}): Promise<AgentResult<SubmissionDraft>> {
  return callAgent({ agent: "a4_submission_drafter", prompt: "a4_submission_drafter.v1", schema, input, ...options });
}
