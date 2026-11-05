import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ScreeningKit } from "@/lib/agents/a3_screening_kit";
import { getDb } from "@/lib/db";
import { screeningKits } from "@/lib/db/schema";
import { requireRole } from "@/lib/session";
import { ActionForm, SubmitButton } from "../../../action-form";
import { DraftLabel } from "../../../draft-label";
import { PrintButton } from "../../../print-button";
import { loadRequirementView } from "../../../requirement-view";
import { makeKit } from "../../../submission-actions";

export default async function Kit({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("recruiter");
  const { requirement, brief } = await loadRequirementView((await params).id);
  if (requirement.assignedRecruiterId !== user.id || !brief) redirect("/recruiter");

  // A kit belongs to one brief version, so a new brief needs a new kit.
  const [kit] = await getDb().select().from(screeningKits).where(eq(screeningKits.briefId, brief.id)).orderBy(desc(screeningKits.id)).limit(1);

  if (!kit) {
    return (
      <>
        <h1>Screening kit <span className="muted">for {requirement.title}, brief v{brief.version}</span></h1>
        <ActionForm action={makeKit}>
          <input type="hidden" name="requirementId" value={requirement.id} />
          <SubmitButton label="Create screening kit" busyLabel="Writing the kit…" />
        </ActionForm>
      </>
    );
  }

  const data = kit.json as ScreeningKit;

  return (
    <div className="brief kit">
      <div className="brief-head">
        <h1>Screening kit <span className="muted">for {requirement.title}, brief v{brief.version}</span></h1>
        <PrintButton />
      </div>
      <DraftLabel model={kit.model} generatedAt={kit.createdAt} />

      <ol className="tight">
        {data.questions.map((item) => (
          <li key={item.question}>
            <strong>{item.question}</strong>
            <br />Good signs: {item.good_answer_signals.join("; ")}
            <br />Red flags: {item.red_flags.join("; ")}
            <br />Follow up: {item.follow_up}
          </li>
        ))}
      </ol>

      <h2>Identity checks</h2>
      <ul className="tight">{data.identity_checks.map((check) => <li key={check}>{check}</li>)}</ul>
    </div>
  );
}
