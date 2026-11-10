import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";

// npm run eval                      -> runs eval/golden/*.json (kept out of git)
// npm run eval -- --set examples    -> runs the fictional examples in eval/examples/

if (existsSync(".env")) loadEnvFile(".env");
// A throwaway in-memory database, so evaluation never touches demo or pilot data.
process.env.DATABASE_URL = "memory://";

const set = process.argv.includes("--set") ? process.argv[process.argv.indexOf("--set") + 1] : "golden";
const folder = path.join("eval", set);

const { eq } = await import("drizzle-orm");
const { getDb, migrateDb } = await import("../lib/db");
const { aiCalls, clients, requirementChecks, users } = await import("../lib/db/schema");
const { loadSeed } = await import("../seed");
const { createRequirement, checkRequirement, generateBrief, latestBrief, safeMessage } = await import("../lib/requirements");
const { readSummary, renderReport, scoreCase, summarise, worseThan } = await import("../lib/eval");
type GoldenCase = import("../lib/eval").GoldenCase;
type CaseResult = import("../lib/eval").CaseResult;

if (!existsSync(folder)) {
  console.error(`No folder ${folder}. See docs/pilot-checklist.md for how to prepare the golden set.`);
  process.exit(1);
}
const files = readdirSync(folder).filter((f) => f.endsWith(".json") && f !== "registry.json").sort();
if (files.length === 0) {
  console.error(`No cases in ${folder}.`);
  process.exit(1);
}

const db = getDb();
await migrateDb();
await loadSeed(db);
const [user] = await db.select().from(users).limit(1);

const results: CaseResult[] = [];
for (const [index, file] of files.entries()) {
  const golden = JSON.parse(readFileSync(path.join(folder, file), "utf8")) as GoldenCase;
  try {
    // Each case gets its own client row, so its industry label reaches A1.
    const [client] = await db
      .insert(clients)
      .values({ code: `CLIENT-${900 + index}`, name: `Evaluation client ${golden.id}`, aliases: [], industryLabel: golden.industry })
      .returning();
    const [subjectLine, ...rest] = golden.text.split(/\r?\n/);
    const context = { db, userId: user.id };
    const requirementId = await createRequirement(context, { subject: subjectLine.replace(/^Subject:\s*/i, ""), body: rest.join("\n"), clientId: client.id });
    await checkRequirement(context, requirementId);
    await generateBrief(context, requirementId);

    const [check] = await db.select().from(requirementChecks).where(eq(requirementChecks.requirementId, requirementId));
    const brief = await latestBrief(db, requirementId);
    results.push(scoreCase(golden, check.json as never, brief!.json as never));
    console.log(`${golden.id}: done`);
  } catch (error) {
    let message: string;
    try {
      message = safeMessage(error);
    } catch {
      message = error instanceof Error ? error.message : String(error);
    }
    results.push({ id: golden.id, error: message });
    console.log(`${golden.id}: failed (${message})`);
  }
}

const summary = summarise(results);
const reportsFolder = path.join("eval", "reports");
mkdirSync(reportsFolder, { recursive: true });

const previousFile = readdirSync(reportsFolder).filter((f) => f.startsWith(`${set}-`)).sort().at(-1);
const previous = previousFile ? readSummary(readFileSync(path.join(reportsFolder, previousFile), "utf8")) : null;
const worse = previous ? worseThan(previous, summary) : null;

const calls = await db.select().from(aiCalls);
const promptVersions = readdirSync("prompts").filter((f) => /^a[12]_/.test(f)).map((f) => f.replace(/\.md$/, "")).sort();
const date = new Date();
const reportPath = path.join(reportsFolder, `${set}-${date.toISOString().replace(/[:.]/g, "-")}.md`);

writeFileSync(
  reportPath,
  renderReport({
    set,
    date,
    provider: process.env.LLM_PROVIDER ?? "mock",
    model: process.env.LLM_MODEL ?? "unset",
    promptVersions,
    results,
    summary,
    worse,
    costUsd: calls.reduce((total, call) => total + Number(call.estimatedCostUsd), 0),
  }),
);

console.log(`Report written to ${reportPath}`);
// A non-zero exit lets automatic checks stop a worse prompt from shipping.
process.exit(worse && worse.length > 0 ? 2 : 0);
