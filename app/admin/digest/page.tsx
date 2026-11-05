import Link from "next/link";
import { latestDigest } from "@/lib/digest";
import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { ActionForm, SubmitButton } from "../../action-form";
import { DraftLabel } from "../../draft-label";
import { runDigest } from "../../feedback-actions";

const reasons = (counts: Record<string, number>) =>
  Object.entries(counts).map(([label, count]) => `${label} ${count}`).join(", ") || "None";

const rate = (part: number, whole: number) => (whole === 0 ? "None" : `${part} of ${whole}`);

export default async function DigestPage() {
  await requireRole("admin");
  const digest = await latestDigest(getDb());

  return (
    <>
      <p><Link href="/admin">Back to admin</Link></p>
      <h1>Weekly digest</h1>
      <ActionForm action={runDigest}>
        <SubmitButton label="Run the digest now" busyLabel="Writing the digest…" />
      </ActionForm>

      {!digest && <p className="muted">No digest yet.</p>}
      {digest && (
        <>
          <DraftLabel model={digest.model} generatedAt={digest.createdAt} />
          <h2>Observations</h2>
          <ul className="tight">{digest.observations.map((line) => <li key={line}>{line}</li>)}</ul>
          <h2>Last 7 days</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Client</th><th>Submissions</th><th>Interviews</th><th>Rejections by reason</th><th>Clarified: interviews</th><th>Skipped: interviews</th></tr>
              </thead>
              <tbody>
                {digest.table.map((row) => (
                  <tr key={row.client_code}>
                    <td>{row.client_code}</td>
                    <td>{row.submissions}</td>
                    <td>{row.interviews}</td>
                    <td>{reasons(row.rejections_by_reason)}</td>
                    <td>{rate(row.clarified_interviews, row.clarified_submissions)}</td>
                    <td>{rate(row.skipped_interviews, row.skipped_submissions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
