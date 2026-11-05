import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiCalls, users } from "@/lib/db/schema";
import { monthlyBudgetUsd, monthSpendUsd } from "@/lib/llm";
import { requireRole } from "@/lib/session";
import { runPipelineTest } from "../actions";

export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("admin");
  const { error } = await searchParams;

  const db = getDb();
  const [spend, calls] = await Promise.all([
    monthSpendUsd(db),
    db
      .select({ call: aiCalls, userName: users.name })
      .from(aiCalls)
      .leftJoin(users, eq(aiCalls.userId, users.id))
      .orderBy(desc(aiCalls.id))
      .limit(50),
  ]);
  const latest = calls.find(({ call }) => call.success)?.call;

  return (
    <>
      <h1>Admin</h1>
      <p>
        AI spend this month: ${spend.toFixed(4)} of ${monthlyBudgetUsd().toFixed(2)}
      </p>
      <form action={runPipelineTest}>
        <button type="submit">Run pipeline test</button>
      </form>
      {error && <p className="notice error" role="alert">{error}</p>}
      {latest && (
        <p className="notice draft-label">
          Draft — check before use. Model: {latest.model}. Generated: {latest.createdAt.toISOString()}.
        </p>
      )}

      <h2>AI call log</h2>
      {calls.length === 0 ? (
        <p className="muted">No AI calls yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th><th>Agent</th><th>Model</th><th>Prompt</th><th>Tokens in/out</th>
                <th>Cost</th><th>Latency</th><th>User</th><th>Record</th><th>Result</th><th>Redacted input</th>
              </tr>
            </thead>
            <tbody>
              {calls.map(({ call, userName }) => (
                <tr key={call.id}>
                  <td>{call.createdAt.toISOString()}</td>
                  <td>{call.agent}</td>
                  <td>{call.provider}/{call.model}</td>
                  <td>{call.promptVersion}</td>
                  <td>{call.inputTokens}/{call.outputTokens}</td>
                  <td>${Number(call.estimatedCostUsd).toFixed(6)}</td>
                  <td>{call.latencyMs} ms</td>
                  <td>{userName}</td>
                  <td>{call.linkedRecordId}</td>
                  <td>{call.success ? "Success" : `Failed: ${call.error}`}</td>
                  <td>{call.redactedInput.slice(0, 120)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
