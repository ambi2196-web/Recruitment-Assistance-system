import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { listSubmissions, reminderDay } from "@/lib/submissions";
import { RequirementList } from "../requirement-list";
import { SubmissionList } from "../submission-parts";

export default async function StakeholderInbox() {
  await requireRole("stakeholder");
  const rows = await listSubmissions(getDb(), { statuses: ["submitted", "forwarded", "rejected", "interview", "client_rejected", "selected", "no_reply"] });
  const reminders = rows.flatMap((row) => {
    const day = reminderDay(row);
    return day ? [{ ...row, day }] : [];
  });

  return (
    <div className="two-columns">
      <section>
        <h1>Stakeholder inbox</h1>
        <RequirementList basePath="/stakeholder" />
      </section>
      <section>
        <h1>Submissions</h1>
        {reminders.length > 0 && (
          <div className="notice ambiguity">
            <strong>Please log the client's reply</strong>
            <ul className="tight">
              {reminders.map((row) => (
                <li key={row.id}>
                  Day {row.day}: <Link href={`/stakeholder/submissions/${row.id}`}>{row.candidateName}, {row.requirementTitle}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <SubmissionList rows={rows} basePath="/stakeholder/submissions" />
      </section>
    </div>
  );
}
