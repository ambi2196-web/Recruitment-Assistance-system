import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import { loadSeed, seedRegistry } from "@/seed";
import { runDummyAgent } from "./agents/a0_dummy";
import { configProblems, hasDemoAccess } from "./config";
import { getDb, migrateDb } from "./db";
import * as schema from "./db/schema";
import { getProvider, LlmBlockedError, LlmOutputError, monthSpendUsd, type LlmProvider } from "./llm";
import { redact, type RedactedText } from "./redaction";

const { aiCalls, clients, requirements, users } = schema;

const reply = (text: string) => ({ text, inputTokens: 100, outputTokens: 50 });
const validReply = reply(JSON.stringify({ status: "ok", characters_received: 5 }));
const fakeProvider = (...replies: ReturnType<typeof reply>[]): LlmProvider & { complete: ReturnType<typeof vi.fn> } => {
  const complete = vi.fn();
  for (const r of replies) complete.mockResolvedValueOnce(r);
  return { name: "fake", complete };
};

function redacted(text: string): RedactedText {
  const result = redact(text, seedRegistry);
  if (!result.ok) throw new Error(result.reason);
  return result.text;
}

const rows = () => getDb().select().from(aiCalls).orderBy(asc(aiCalls.id));

beforeAll(async () => {
  await migrateDb();
  await loadSeed(getDb());
});

beforeEach(async () => {
  await getDb().delete(aiCalls);
  vi.stubEnv("MONTHLY_BUDGET_USD", "5");
});

describe("seed", () => {
  it("loads the users, clients and requirements in section 10.3", async () => {
    const db = getDb();
    expect(await db.select().from(users)).toHaveLength(5);
    expect(await db.select().from(clients)).toHaveLength(3);
    expect(await db.select().from(requirements)).toHaveLength(3);
  });

  it("does not duplicate data when run twice", async () => {
    await loadSeed(getDb());
    expect(await getDb().select().from(users)).toHaveLength(5);
  });

  it("stores redacted text with no client names or rates", async () => {
    const stored = await getDb().select().from(requirements);
    for (const row of stored) {
      expect(row.redactedText).not.toMatch(/halvorsen|redcliff|tarnbrook|larkspur|\$|@example/i);
    }
  });
});

describe("audit log (M13)", () => {
  it("logs every required field, including the redacted input", async () => {
    const [user] = await getDb().select().from(users).limit(1);
    const input = redacted("Halvorsen pays $85/hr");

    await runDummyAgent(input, { userId: user.id, linkedRecordId: "requirement:1", provider: fakeProvider(validReply) });

    const [row] = await rows();
    expect(row).toMatchObject({
      agent: "a0_dummy",
      provider: "fake",
      model: "mock-1",
      promptVersion: "v1",
      redactedInput: "CLIENT-01 [RATE]",
      inputTokens: 100,
      outputTokens: 50,
      userId: user.id,
      linkedRecordId: "requirement:1",
      success: true,
    });
    expect(Number(row.estimatedCostUsd)).toBeGreaterThan(0);
    expect(row.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("works end to end with the built-in mock provider", async () => {
    const result = await runDummyAgent(redacted("Hello"));
    expect(result.data.status).toBe("ok");
    expect(await rows()).toHaveLength(1);
  });

  it("logs a provider failure", async () => {
    const provider = fakeProvider();
    provider.complete.mockRejectedValue(new Error("network down"));

    await expect(runDummyAgent(redacted("Hello"), { provider })).rejects.toThrow("network down");

    const [row] = await rows();
    expect(row).toMatchObject({ success: false, error: "provider_error" });
  });
});

describe("output validation (section 11.1)", () => {
  it("retries once after invalid JSON", async () => {
    const provider = fakeProvider(reply("not json"), validReply);

    const result = await runDummyAgent(redacted("Hello"), { provider });

    expect(result.data.status).toBe("ok");
    expect((await rows()).map((r) => r.success)).toEqual([false, true]);
  });

  it("gives up after a second invalid answer", async () => {
    const provider = fakeProvider(reply('{"status":"maybe"}'), reply("not json"), validReply);

    await expect(runDummyAgent(redacted("Hello"), { provider })).rejects.toThrow(LlmOutputError);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });
});

describe("budget cap (FR-13.2)", () => {
  async function spend(amount: string) {
    await getDb().insert(aiCalls).values({
      agent: "x", provider: "x", model: "x", promptVersion: "v1",
      redactedInput: "x", estimatedCostUsd: amount, success: true,
    });
  }

  it("blocks the call once the budget is reached", async () => {
    await spend("5");
    const provider = fakeProvider(validReply);

    await expect(runDummyAgent(redacted("Hello"), { provider })).rejects.toThrow(LlmBlockedError);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("allows the call just under the budget", async () => {
    await spend("4.99");
    await expect(runDummyAgent(redacted("Hello"), { provider: fakeProvider(validReply) })).resolves.toBeDefined();
  });

  it.each([["0"], [""], ["abc"], ["-5"]])("treats a budget of %j as a full stop", async (budget) => {
    vi.stubEnv("MONTHLY_BUDGET_USD", budget);
    const provider = fakeProvider(validReply);

    await expect(runDummyAgent(redacted("Hello"), { provider })).rejects.toThrow(LlmBlockedError);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("counts only the current month", async () => {
    await spend("1");
    await getDb().update(aiCalls).set({ createdAt: new Date("2020-01-15T00:00:00Z") }).where(eq(aiCalls.agent, "x"));
    expect(await monthSpendUsd(getDb())).toBe(0);
  });
});

describe("G1 at the model door", () => {
  it.each([
    ["client name", "Halvorsen needs help"],
    ["rate", "This pays $85/hr"],
    ["email", "Mail a@example.com"],
  ])("refuses unredacted input with a %s, even if forced past the type check", async (_label, text) => {
    const provider = fakeProvider(validReply);

    await expect(runDummyAgent(text as RedactedText, { provider })).rejects.toThrow(LlmBlockedError);

    expect(provider.complete).not.toHaveBeenCalled();
    expect(await rows()).toHaveLength(0);
  });
});

describe("provider selection", () => {
  it("refuses a provider that is not set up", () => {
    vi.stubEnv("LLM_PROVIDER", "unknown");
    expect(() => getProvider()).toThrow(LlmBlockedError);
    vi.stubEnv("LLM_PROVIDER", "mock");
  });
});

describe("G4: no scoring in the data model", () => {
  it("has no score, rank or fit column on any table", () => {
    const tables = Object.values(schema).filter((value) => isTable(value));
    expect(tables.length).toBeGreaterThan(10);
    for (const table of tables) {
      for (const column of Object.values(getTableColumns(table))) {
        expect(`${getTableName(table)}.${column.name}`).not.toMatch(/scor|rank|percent|(^|\.|_)fit(_|$)|recommend/i);
      }
    }
  });
});

describe("demo safety (11.1)", () => {
  const ok = { APP_ENV: "demo", DEMO_MODE: "true", NODE_ENV: "development" };

  it("accepts a local demo", () => {
    expect(configProblems(ok)).toEqual([]);
  });

  it("refuses demo mode on the pilot", () => {
    expect(configProblems({ ...ok, APP_ENV: "pilot" })).toHaveLength(1);
  });

  it("refuses a deployed demo with no password", () => {
    expect(configProblems({ ...ok, NODE_ENV: "production" })).toHaveLength(1);
    expect(configProblems({ ...ok, NODE_ENV: "production", DEMO_ACCESS_PASSWORD: "x" })).toEqual([]);
  });

  it("refuses a missing or misspelt APP_ENV", () => {
    expect(configProblems({ ...ok, APP_ENV: undefined })).toHaveLength(1);
    expect(configProblems({ ...ok, APP_ENV: "prod" })).toHaveLength(1);
  });

  it("accepts a pilot with demo mode off", () => {
    expect(configProblems({ APP_ENV: "pilot", DEMO_MODE: "false", NODE_ENV: "production" })).toEqual([]);
  });

  it("checks the demo password", () => {
    const header = `Basic ${Buffer.from("demo:secret").toString("base64")}`;
    expect(hasDemoAccess(header, "secret")).toBe(true);
    expect(hasDemoAccess(header, "wrong")).toBe(false);
    expect(hasDemoAccess(null, "secret")).toBe(false);
    expect(hasDemoAccess("Bearer abc", "secret")).toBe(false);
  });
});
