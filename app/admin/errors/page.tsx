import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { errorFlags, requirements, users } from "@/lib/db/schema";
import { requireRole } from "@/lib/session";
import { ActionForm, SubmitButton } from "../../action-form";
import { fixPrompt } from "../../feedback-actions";

export default async function ErrorLog() {
  await requireRole("admin");
  const rows = await getDb()
    .select({ flag: errorFlags, title: requirements.title, reporter: users.name })
    .from(errorFlags)
    .innerJoin(requirements, eq(errorFlags.requirementId, requirements.id))
    .innerJoin(users, eq(errorFlags.reportedBy, users.id))
    .orderBy(desc(errorFlags.id));

  return (
    <>
      <p><Link href="/admin">Back to admin</Link></p>
      <h1>Error log</h1>
      {rows.length === 0 ? (
        <p className="muted">No lines have been flagged.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Requirement</th><th>Agent</th><th>Line</th><th>Note</th><th>Flagged by</th><th>Prompt</th></tr>
            </thead>
            <tbody>
              {rows.map(({ flag, title, reporter }) => (
                <tr key={flag.id}>
                  <td>{title}</td>
                  <td>{flag.agent}</td>
                  <td>{flag.lineRef}</td>
                  <td>{flag.note}</td>
                  <td>{reporter}</td>
                  <td>
                    {flag.status === "prompt_fixed" && flag.fixedCommit ? (
                      <a href={flag.fixedCommit} rel="noreferrer">Fixed</a>
                    ) : (
                      <ActionForm action={fixPrompt} className="inline-form">
                        <input type="hidden" name="flagId" value={flag.id} />
                        <input name="commit" placeholder="Link to the commit" aria-label="Link to the commit" required />
                        <SubmitButton label="Mark fixed" />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
