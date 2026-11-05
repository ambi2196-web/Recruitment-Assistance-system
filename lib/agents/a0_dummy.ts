import { z } from "zod";
import { callAgent, type AgentCall, type AgentResult } from "../llm";
import type { RedactedText } from "../redaction";

// Proves the pipeline in Phase 0: redaction, budget check, model call, audit log.
const schema = z.object({
  status: z.literal("ok"),
  characters_received: z.number().int().nonnegative(),
});

export type DummyOutput = z.infer<typeof schema>;

type Options = Pick<AgentCall<DummyOutput>, "userId" | "linkedRecordId" | "db" | "provider">;

export function runDummyAgent(input: RedactedText, options: Options = {}): Promise<AgentResult<DummyOutput>> {
  return callAgent({ agent: "a0_dummy", prompt: "a0_dummy.v1", schema, input, ...options });
}
