import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { REJECT_REASONS, restoreCandidate } from "@/lib/submissions";
import { ActionForm, SubmitButton } from "../../../action-form";
import { DraftLabel } from "../../../draft-label";
import { decide } from "../../../submission-actions";
import { EvidenceTable, FlagList } from "../../../submission-parts";
import { loadSubmissionView } from "../../../submission-view";

export default async function StakeholderSubmission({ params }: { params: Promise<{ sid: string }> }) {
  await requireRole("stakeholder");
  const { submission, candidate, requirement, draft, flags, resolutions, log } = await loadSubmissionView((await params).sid);

  // A draft stays with its recruiter until they approve it (G5).
  if (submission.status === "draft") redirect("/stakeholder");

  const lines = submission.editedSummary?.split("\n") ?? draft.output.summary_5_lines.map((line) => restoreCandidate(line, candidate.displayName));
  const unresolved = flags.filter((flag) => resolutions[flag.id]?.status === "Unresolved").length;
  const idField = <input type="hidden" name="submissionId" value={submission.id} />;

  return (
    <div className="brief">
      <h1>{candidate.displayName} <span className="muted">for {requirement.title}</span></h1>
      <DraftLabel model={draft.model} generatedAt={new Date(draft.generatedAt)} />
      {unresolved > 0 && (
        <p className="notice error"><strong>{unresolved} flag(s) are unresolved.</strong> Read them before you decide.</p>
      )}

      <div className="two-columns">
        <section>
          <h2>Summary</h2>
          <ul className="tight">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
          <h2>Evidence</h2>
          <EvidenceTable evidence={draft.output.evidence_per_must_have} />
        </section>

        <section>
          <h2>Verification: flags and recruiter notes</h2>
          <FlagList flags={flags} resolutions={resolutions} />

          {submission.status === "submitted" && (
            <>
              <h2>Your decision</h2>
              <ActionForm action={decide} className="stack">
                {idField}
                <SubmitButton label="I forwarded this to the client" />
                <p className="muted">The desk does not send anything. Forward it from your own mailbox first.</p>
              </ActionForm>
              <h2>Or reject, with a reason</h2>
              <ActionForm action={decide} className="stack">
                {idField}
                <input name="note" placeholder="Note (needed for Other)" aria-label="Rejection note" />
                <div className="button-row">
                  {REJECT_REASONS.map((reason) => <SubmitButton key={reason} label={reason} name="reason" value={reason} />)}
                </div>
              </ActionForm>
            </>
          )}

          <h2>Decisions</h2>
          <ul className="tight">
            {log.map((entry) => (
              <li key={`${entry.action}-${entry.createdAt.toISOString()}`}>
                {entry.action}: {entry.userName}, {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
