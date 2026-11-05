import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, gte, lt, sum } from "drizzle-orm";
import type { z } from "zod";
import { getDb, type Db } from "./db";
import { aiCalls, clients, prospectTerms } from "./db/schema";
import { selfCheck, type RedactedText, type Registry } from "./redaction";

// This is the only door to a model. There is deliberately no way to pass
// tools here (G2, G3), and input must already be redacted (G1).

export type ModelRequest = { model: string; system: string; user: string };
export type ModelResponse = { text: string; inputTokens: number; outputTokens: number };
export type LlmProvider = { name: string; complete(request: ModelRequest): Promise<ModelResponse> };

/** Stopped on purpose, with a message that is safe to show the user. */
export class LlmBlockedError extends Error {}
/** The model answered, but not in the agreed shape, even after one retry. */
export class LlmOutputError extends Error {}

// Lets the whole app run with no API key and no data leaving the machine.
const mockProvider: LlmProvider = {
  name: "mock",
  async complete({ user }) {
    return {
      text: JSON.stringify({ status: "ok", characters_received: user.length }),
      inputTokens: Math.ceil(user.length / 4),
      outputTokens: 20,
    };
  },
};

export function getProvider(): LlmProvider {
  const name = process.env.LLM_PROVIDER ?? "mock";
  if (name === "mock") return mockProvider;
  throw new LlmBlockedError(`Model provider "${name}" is not set up.`);
}

// US dollars per million tokens.
const PRICES: Record<string, { input: number; output: number }> = {
  "mock-1": { input: 1, output: 5 },
};
// An unknown model is priced high so the budget cap errs on the safe side.
const UNKNOWN_MODEL_PRICE = { input: 20, output: 100 };

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? UNKNOWN_MODEL_PRICE;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// A missing or broken setting counts as zero, so a typo stops spending.
export function monthlyBudgetUsd(): number {
  const budget = Number(process.env.MONTHLY_BUDGET_USD);
  return Number.isFinite(budget) && budget > 0 ? budget : 0;
}

export async function monthSpendUsd(db: Db, now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [row] = await db
    .select({ total: sum(aiCalls.estimatedCostUsd) })
    .from(aiCalls)
    .where(and(gte(aiCalls.createdAt, start), lt(aiCalls.createdAt, end)));
  return Number(row?.total ?? 0);
}

async function assertWithinBudget(db: Db): Promise<void> {
  const budget = monthlyBudgetUsd();
  if ((await monthSpendUsd(db)) >= budget) {
    throw new LlmBlockedError("The monthly AI budget has been reached, so AI is paused. Ask the admin.");
  }
}

export async function loadRegistry(db: Db): Promise<Registry> {
  const [clientRows, prospectRows] = await Promise.all([
    db.select({ code: clients.code, name: clients.name, aliases: clients.aliases }).from(clients),
    db.select({ term: prospectTerms.term }).from(prospectTerms),
  ]);
  return { clients: clientRows, prospectTerms: prospectRows.map((p) => p.term) };
}

function parseOutput<T>(text: string, schema: z.ZodType<T>): T | null {
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export type AgentCall<T> = {
  agent: string;
  /** File name in prompts/, without .md. The part after the first dot is the version. */
  prompt: string;
  schema: z.ZodType<T>;
  input: RedactedText;
  userId?: number;
  linkedRecordId?: string;
  db?: Db;
  provider?: LlmProvider;
};

export type AgentResult<T> = { data: T; model: string; generatedAt: Date };

export async function callAgent<T>(call: AgentCall<T>): Promise<AgentResult<T>> {
  const db = call.db ?? getDb();
  const provider = call.provider ?? getProvider();
  const model = process.env.LLM_MODEL ?? "unset";

  // The type system already requires redacted input. This repeats the check at
  // run time, because a leak here is the one failure we cannot take back.
  const problem = selfCheck(call.input, await loadRegistry(db));
  if (problem) throw new LlmBlockedError(`Blocked before the AI call: ${problem}`);

  const system = await readFile(path.join(process.cwd(), "prompts", `${call.prompt}.md`), "utf8");
  const promptVersion = call.prompt.slice(call.prompt.indexOf(".") + 1);

  const log = (values: { success: boolean; error?: string; latencyMs: number; response?: ModelResponse }) =>
    db.insert(aiCalls).values({
      agent: call.agent,
      provider: provider.name,
      model,
      promptVersion,
      redactedInput: call.input,
      inputTokens: values.response?.inputTokens ?? 0,
      outputTokens: values.response?.outputTokens ?? 0,
      estimatedCostUsd: estimateCostUsd(model, values.response?.inputTokens ?? 0, values.response?.outputTokens ?? 0).toFixed(6),
      latencyMs: values.latencyMs,
      userId: call.userId,
      linkedRecordId: call.linkedRecordId,
      success: values.success,
      error: values.error,
    });

  const maxAttempts = 2; // One retry on invalid output (section 11.1).
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await assertWithinBudget(db);

    const startedAt = Date.now();
    let response: ModelResponse;
    try {
      response = await provider.complete({ model, system, user: call.input });
    } catch (error) {
      await log({ success: false, error: "provider_error", latencyMs: Date.now() - startedAt });
      throw error;
    }

    const latencyMs = Date.now() - startedAt;
    const data = parseOutput(response.text, call.schema);
    if (data !== null) {
      await log({ success: true, latencyMs, response });
      return { data, model, generatedAt: new Date() };
    }
    await log({ success: false, error: "invalid_output", latencyMs, response });
  }

  throw new LlmOutputError("The AI returned an unusable answer. Please try again.");
}
