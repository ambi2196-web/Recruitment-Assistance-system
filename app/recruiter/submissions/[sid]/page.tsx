import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { conrepText, restoreCandidate } from "@/lib/submissions";
import { CopyButton } from "../../../copy-button";
import { DraftLabel } from "../../../draft-label";
import { EvidenceTable, FlagList, rejectionInPlainEnglish } from "../../../submission-parts";
import { loadSubmissionView } from "../../../submission-view";
import { ReviewForm } from "./review-form";

export default async function RecruiterSubmission({ params }: { params: Promise<{ sid: string }> }) {
  const user = await requireRole("recruiter");
  const { submission, candidate, requirement, client, draft, flags, resolutions } = await loadSubmissionView((await params).sid);

  // Drafts come from an agent that read untrusted text, so only their recruiter sees them (G3).
  if (submission.recruiterId !== user.id) redirect("/recruiter");

  const name = candidate.displayName;
  const summaryLines = draft.output.summary_5_lines.map((line) => restoreCandidate(line, name));
  const finalLines = submission.editedSummary?.split("\n") ?? summaryLines;

  return (
    <div className="brief">
      <h1>{name} <span className="muted">for {requirement.title}</span></h1>
      <DraftLabel model={draft.model} generatedAt={new Date(draft.generatedAt)} />

      {submission.rejectReason && (
        <p className="notice error"><strong>Rejected.</strong> {rejectionInPlainEnglish(submission.rejectReason)}</p>
      )}
      {submission.status === "forwarded" && <p className="notice changed">Forwarded to the client. No outcome yet.</p>}
      {submission.status === "no_reply" && <p className="notice changed">Forwarded to the client. No reply yet.</p>}
      {submission.clientOutcome && (
        <p className={`notice ${submission.status === "client_rejected" ? "error" : "changed"}`}>
          <strong>Client outcome: {submission.clientOutcome}.</strong>{" "}
          {submission.outcomeReason && rejectionInPlainEnglish(submission.outcomeReason)}
        </p>
      )}

      <div className="two-columns">
        <section>
          <h2>Evidence</h2>
          <EvidenceTable evidence={draft.output.evidence_per_must_have} />
          {draft.output.questions_to_clarify_with_candidate.length > 0 && <h2>Ask the candidate</h2>}
          <ul className="tight">
            {draft.output.questions_to_clarify_with_candidate.map((question) => <li key={question}>{question}</li>)}
          </ul>
        </section>

        <section>
          {submission.status === "draft" ? (
            <ReviewForm submissionId={submission.id} flags={flags} summary={summaryLines.join("\n")} />
          ) : (
            <>
              <h2>Summary</h2>
              <ul className="tight">{finalLines.map((line) => <li key={line}>{line}</li>)}</ul>
              <h2>Flags</h2>
              <FlagList flags={flags} resolutions={resolutions} />
              <h2>Conrep-ready text</h2>
              <pre className="copy-text">
                {conrepText({ candidateName: name, requirementTitle: requirement.title, summaryLines: finalLines, evidence: draft.output.evidence_per_must_have, flags, resolutions, client })}
              </pre>
              <CopyButton
                text={conrepText({ candidateName: name, requirementTitle: requirement.title, summaryLines: finalLines, evidence: draft.output.evidence_per_must_have, flags, resolutions, client })}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
