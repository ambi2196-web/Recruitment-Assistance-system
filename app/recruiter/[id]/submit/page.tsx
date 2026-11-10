import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { ActionForm, SubmitButton } from "../../../action-form";
import { loadRequirementView } from "../../../requirement-view";
import { draft } from "../../../submission-actions";

export default async function NewSubmission({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("recruiter");
  const { requirement, brief } = await loadRequirementView((await params).id);
  if (requirement.assignedRecruiterId !== user.id || !brief) redirect("/recruiter");

  return (
    <>
      <h1>Add a candidate <span className="muted">for {requirement.title}</span></h1>
      <p className="muted">Checks run first. The name, contact details, client names and rates are hidden before any AI call.</p>
      <ActionForm action={draft} className="stack">
        <input type="hidden" name="requirementId" value={requirement.id} />
        <label>Candidate name <input name="candidateName" required /></label>
        <label>
          Resume file (PDF, DOCX or plain text, up to 3 MB)
          <input name="resumeFile" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" />
        </label>
        <div className="two-columns">
          <label>Or paste the resume text <textarea name="resumeText" rows={12} /></label>
          <label>Call notes <textarea name="callNotes" rows={12} required /></label>
        </div>
        <SubmitButton label="Check and draft" busyLabel="Checking and drafting. This can take up to a minute…" />
      </ActionForm>
    </>
  );
}
