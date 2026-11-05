import { restoreClientName, SKIP_REASONS } from "@/lib/requirements";
import { requireRole } from "@/lib/session";
import { ActionForm, SubmitButton } from "../../action-form";
import { CopyButton } from "../../copy-button";
import { DraftLabel } from "../../draft-label";
import { answer, retryBrief, runCheck, send, skip } from "../../requirement-actions";
import { loadRequirementView } from "../../requirement-view";

const ACTION_LABELS: Record<string, string> = {
  created: "Forwarded to the desk",
  send: "Approved questions for the client",
  edit_and_send: "Edited and approved questions for the client",
  skip: "Skipped client questions",
  client_answer: "Added the client's answer",
};

function copyReadyText(questions: string[], client: { code: string; name: string }, title: string) {
  const list = questions.map((question, index) => `${index + 1}. ${question}`).join("\n");
  return restoreClientName(`Hi,\n\nBefore we start sourcing for ${title}, could you please confirm the following?\n\n${list}\n\nThank you.`, client);
}

export default async function StakeholderRequirement({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("stakeholder");
  const { requirement, client, check, checkJson, brief, actions } = await loadRequirementView((await params).id);
  const idField = <input type="hidden" name="requirementId" value={requirement.id} />;

  const sent = actions.findLast(({ action }) => action.action === "send" || action.action === "edit_and_send");
  const sentQuestions = (sent?.action.detail as { questions: string[] } | undefined)?.questions;
  const canAnswer = ["clarifying", "released", "active"].includes(requirement.status);

  return (
    <div className="brief">
      <h1>{requirement.title}</h1>
      <p className="muted">
        {client.code}, {client.industryLabel}. Status: {requirement.status}.
        {brief && ` Recruiter brief is at version ${brief.version}.`}
      </p>

      {!checkJson && (
        <ActionForm action={runCheck}>
          {idField}
          <SubmitButton label="Run requirement check" busyLabel="Checking. This can take up to a minute…" />
        </ActionForm>
      )}

      {check && checkJson && (
        <div className="two-columns">
          <section>
            <DraftLabel model={check.model} generatedAt={check.createdAt} />
            <ul className="tight">{checkJson.summary.map((line) => <li key={line}>{line}</li>)}</ul>
            <p className="muted">
              Role family: {checkJson.role_family}. Confidence: {checkJson.confidence}. {checkJson.confidence_reason}
            </p>

            <h2>Must-haves</h2>
            <p>{checkJson.must_haves.join(", ") || "None stated."}</p>
            <h2>Nice-to-haves</h2>
            <p>{checkJson.nice_to_haves.join(", ") || "None stated."}</p>

            {checkJson.ambiguous_terms.length > 0 && <h2>Ambiguous terms</h2>}
            {checkJson.ambiguous_terms.map((term) => (
              <div key={term.term} className="notice ambiguity">
                <strong>{term.term}</strong>
                <ul className="tight">
                  {term.possible_meanings.map((meaning, index) => (
                    <li key={meaning}>{meaning}: {term.profile_each_implies[index]}</li>
                  ))}
                </ul>
              </div>
            ))}

            <h2>Missing information</h2>
            <ul className="tight">
              {checkJson.missing_info.map((gap) => (
                <li key={gap.item}>{gap.item}: {gap.why_it_matters}</li>
              ))}
            </ul>
          </section>

          <section>
            {requirement.status === "checked" && (
              <>
                <h2>Questions for the client</h2>
                <p className="muted">Edit these if needed. The desk never sends them. You send them yourself.</p>
                <ActionForm action={send} className="stack">
                  {idField}
                  {checkJson.client_questions.map((question) => (
                    <textarea key={question} name="question" defaultValue={question} rows={2} aria-label="Client question" />
                  ))}
                  <SubmitButton label="SEND: get copy-ready text" />
                </ActionForm>

                <h2>Or skip the questions</h2>
                <ActionForm action={skip} className="button-row">
                  {idField}
                  {SKIP_REASONS.map((reason) => (
                    <SubmitButton key={reason} label={reason} name="reason" value={reason} />
                  ))}
                </ActionForm>
              </>
            )}

            {sentQuestions && (
              <>
                <h2>Copy-ready text for the client</h2>
                <pre className="copy-text">{copyReadyText(sentQuestions, client, requirement.title)}</pre>
                <CopyButton text={copyReadyText(sentQuestions, client, requirement.title)} />
              </>
            )}

            {canAnswer && !brief && (
              <ActionForm action={retryBrief}>
                {idField}
                <p className="notice error">The recruiter brief was not created.</p>
                <SubmitButton label="Try the brief again" busyLabel="Writing the brief…" />
              </ActionForm>
            )}

            {canAnswer && brief && (
              <>
                <h2>Client's answer</h2>
                <ActionForm action={answer} className="stack">
                  {idField}
                  <textarea name="answer" rows={3} aria-label="Client's answer" required />
                  <SubmitButton label="Add answer and update the brief" busyLabel="Updating the brief…" />
                </ActionForm>
              </>
            )}

            <h2>Decisions</h2>
            <ul className="tight">
              {actions.map(({ action, userName }) => (
                <li key={action.id}>
                  {ACTION_LABELS[action.action] ?? action.action}: {userName}, {action.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  {action.action === "skip" && ` (${(action.detail as { reason: string }).reason})`}
                </li>
              ))}
            </ul>

            <details>
              <summary>Original email (restricted)</summary>
              <pre className="copy-text">{requirement.originalText}</pre>
            </details>
          </section>
        </div>
      )}
    </div>
  );
}
