import { z } from "zod";
import { callAgent, type AgentCall, type AgentResult } from "../llm";
import type { RedactedText } from "../redaction";

const schema = z.object({ observations: z.array(z.string().min(1)).min(1).max(5) });

export type WeeklyDigest = z.infer<typeof schema>;

type Options = Pick<AgentCall<WeeklyDigest>, "userId" | "db" | "provider">;

export function runWeeklyDigest(input: RedactedText, options: Options = {}): Promise<AgentResult<WeeklyDigest>> {
  return callAgent({ agent: "a5_weekly_digest", prompt: "a5_weekly_digest.v1", schema, input, linkedRecordId: "digest", ...options });
}
