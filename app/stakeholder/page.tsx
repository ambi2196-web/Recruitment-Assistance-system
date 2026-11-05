import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { listSubmissions } from "@/lib/submissions";
import { RequirementList } from "../requirement-list";
import { SubmissionList } from "../submission-parts";

export default async function StakeholderInbox() {
  await requireRole("stakeholder");
  const rows = await listSubmissions(getDb(), { statuses: ["submitted", "forwarded", "rejected"] });

  return (
    <div className="two-columns">
      <section>
        <h1>Stakeholder inbox</h1>
        <RequirementList basePath="/stakeholder" />
      </section>
      <section>
        <h1>Submissions</h1>
        <SubmissionList rows={rows} basePath="/stakeholder/submissions" />
      </section>
    </div>
  );
}
